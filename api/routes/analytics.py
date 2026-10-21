"""Queue analytics endpoints for operational dashboards.

These read the same rows the rest of the API writes: a ticket is "served" when
its status is `completed`, the service it belongs to is joined on
`service_id`, and a desk's state is the latest row of `desk_settings`. The day
and the hour are the office's, in Kigali, because the office is there.
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta, timezone

from db import get_db
from routes.visitor import LONGEST_SERVICE_SECONDS
from util import local_date, local_sql, now, parse, seconds_since

bp = Blueprint("analytics", __name__)


@bp.route("/api/analytics/queue", methods=["GET"])
def queue_analytics():
    """Real-time queue metrics for the whole office.

    Query params:
    - service: optional service letter filter (A, B, C)
    - desk_id: optional desk filter
    """
    conn = get_db()

    service_filter = request.args.get("service")
    desk_filter = request.args.get("desk_id")

    where = ["t.status = 'waiting'"]
    params = []
    if service_filter:
        where.append("s.letter = ?")
        params.append(service_filter.upper())
    if desk_filter:
        where.append("t.desk_id = ?")
        params.append(int(desk_filter))
    where_sql = " and ".join(where)

    queue_length = conn.execute(
        "select count(*) as c from tickets t "
        "join services s on t.service_id = s.service_id "
        "where " + where_sql,
        params,
    ).fetchone()["c"]

    today = local_date().isoformat()

    served_today = conn.execute(
        "select count(*) as c from tickets "
        "where status = 'completed' "
        "and substr(" + local_sql("closed_at") + ", 1, 10) = ?",
        (today,),
    ).fetchone()["c"]

    wait_row = conn.execute(
        "select avg((julianday(called_at) - julianday(created_at)) * 86400) as avg_wait "
        "from tickets "
        "where status = 'completed' and called_at > created_at "
        "and substr(" + local_sql("called_at") + ", 1, 10) = ?",
        (today,),
    ).fetchone()
    avg_wait_seconds = int(wait_row["avg_wait"]) if wait_row["avg_wait"] else None

    busiest = conn.execute(
        "select substr(" + local_sql("created_at") + ", 12, 2) as hour, count(*) as c "
        "from tickets "
        "where substr(" + local_sql("created_at") + ", 1, 10) = ? "
        "group by hour order by c desc limit 1",
        (today,),
    ).fetchone()
    busiest_hour = int(busiest["hour"]) if busiest else None

    # Recent throughput over the last two hours, kept for the rate the page can
    # show next to the estimate.
    two_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(
        timespec="seconds"
    )
    recent = conn.execute(
        "select count(*) as c from tickets "
        "where status = 'completed' and closed_at >= ?",
        (two_hours_ago,),
    ).fetchone()["c"]
    service_rate = recent / 2.0 if recent > 0 else 0.0

    # The estimate is the measurement the visitor page already trusts: the
    # average time a served ticket took, times the numbers still ahead. It is
    # withheld when nothing has been served today, rather than guessed from a
    # queue that has not moved and would otherwise read as hours.
    service_row = conn.execute(
        "select avg((julianday(closed_at) - julianday(called_at)) * 86400) as avg_service "
        "from tickets "
        "where status = 'completed' and called_at is not null and closed_at is not null "
        "and substr(" + local_sql("closed_at") + ", 1, 10) = ?",
        (today,),
    ).fetchone()
    avg_service = service_row["avg_service"]

    estimated_wait = int(queue_length * avg_service) if (avg_service and queue_length) else None

    return jsonify(
        ok=True,
        timestamp=now(),
        data={
            "current_queue_length": queue_length,
            "average_wait_time_seconds": avg_wait_seconds,
            "tickets_served_today": served_today,
            "busiest_hour": busiest_hour,
            "estimated_wait_seconds": estimated_wait,
            "service_rate_per_hour": round(service_rate, 1),
        },
    )


@bp.route("/api/analytics/desk/<int:desk_id>", methods=["GET"])
def desk_analytics(desk_id):
    """Analytics for one counter.

    The state is the latest desk setting, which is the same value the desk
    badge and the board read, so the three cannot disagree.
    """
    conn = get_db()

    row = conn.execute(
        "select d.desk_id, d.name, s.letter, "
        "  (select service_state from desk_settings ds "
        "     where ds.desk_id = d.desk_id "
        "     order by ds.setting_id desc limit 1) as state "
        "from desks d "
        "join services s on d.service_id = s.service_id "
        "where d.desk_id = ?",
        (desk_id,),
    ).fetchone()

    if row is None:
        return jsonify(ok=False, error="Desk not found"), 404

    today = local_date().isoformat()

    served_today = conn.execute(
        "select count(*) as c from tickets "
        "where desk_id = ? and status = 'completed' "
        "and substr(" + local_sql("closed_at") + ", 1, 10) = ?",
        (desk_id, today),
    ).fetchone()["c"]

    # This desk's own service time, measured the same way the visitor page
    # measures it: called to closed, over its most recent completed tickets.
    durations = []
    for ticket in conn.execute(
        "select called_at, closed_at from tickets "
        "where desk_id = ? and status = 'completed' "
        "and called_at is not null and closed_at is not null "
        "order by closed_at desc limit 20",
        (desk_id,),
    ):
        called, closed = parse(ticket["called_at"]), parse(ticket["closed_at"])
        if called is None or closed is None:
            continue
        seconds = (closed - called).total_seconds()
        if 0 <= seconds <= LONGEST_SERVICE_SECONDS:
            durations.append(seconds)
    avg_service = int(sum(durations) / len(durations)) if durations else None

    active_hours = conn.execute(
        "select count(distinct substr(" + local_sql("closed_at") + ", 12, 2)) as c "
        "from tickets "
        "where desk_id = ? and status = 'completed' "
        "and substr(" + local_sql("closed_at") + ", 1, 10) = ?",
        (desk_id, today),
    ).fetchone()["c"] or 0
    utilization = round((active_hours / 8.0) * 100, 1) if active_hours else 0.0

    last_served = conn.execute(
        "select max(closed_at) as last from tickets "
        "where desk_id = ? and status = 'completed'",
        (desk_id,),
    ).fetchone()["last"]
    last_age = seconds_since(last_served) if last_served else None

    return jsonify(
        ok=True,
        timestamp=now(),
        data={
            "desk_id": row["desk_id"],
            "desk_name": row["name"],
            "service_letter": row["letter"],
            "state": row["state"] or "paused",
            "tickets_served_today": served_today,
            "average_service_time_seconds": avg_service,
            "utilization_percent": utilization,
            "last_ticket_age_seconds": int(last_age) if last_age is not None else None,
        },
    )


@bp.route("/api/analytics/trends", methods=["GET"])
def service_trends():
    """The last seven days for the whole office, quiet days included.

    A day with no tickets is still a day: it is returned with zeros so the
    chart does not imply the office was closed when it simply had no visitors.
    """
    conn = get_db()

    start = local_date() - timedelta(days=6)

    counted = {
        row["day"]: row
        for row in conn.execute(
            "select substr(" + local_sql("created_at") + ", 1, 10) as day, "
            "count(*) as issued, "
            "  sum(case when status = 'completed' then 1 else 0 end) as served, "
            "  avg(case when status = 'completed' and called_at > created_at "
            "    then (julianday(called_at) - julianday(created_at)) * 86400 "
            "    else null end) as avg_wait "
            "from tickets "
            "where substr(" + local_sql("created_at") + ", 1, 10) between ? and ? "
            "group by day",
            (start.isoformat(), local_date().isoformat()),
        )
    }

    trends = []
    day = start
    while day <= local_date():
        key = day.isoformat()
        row = counted.get(key)
        trends.append(
            {
                "date": key,
                "total_tickets": row["issued"] if row else 0,
                "total_served": (row["served"] or 0) if row else 0,
                "average_wait_time_seconds": (
                    int(row["avg_wait"]) if row and row["avg_wait"] else None
                ),
            }
        )
        day += timedelta(days=1)

    return jsonify(
        ok=True,
        timestamp=now(),
        data={"period_days": 7, "trends": trends},
    )
