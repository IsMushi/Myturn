# Fonts

The interface is set in **Google Sans**, which Google now serves from Google
Fonts. The files in this folder are the two Latin subsets fetched from the
Google Fonts CDN, so the interface does not ask googleapis.com for anything at
build time or at run time. The demo keeps working with no internet connection.

```
GoogleSans-Latin.woff2       Latin, covers U+0000-00FF and punctuation
GoogleSans-LatinExt.woff2    Latin Extended, covers the accented characters
unicode-ranges.json          the unicode ranges the two files are declared with
```

Both files are the variable font: one file each covers weights 400 to 700. The
`@font-face` rules in `src/app/globals.css` declare them with the matching
`unicode-range`, which is how the browser knows to fetch only the subset it
needs for the text on the page.

## Monospaced device identifiers

`JetBrainsMono-Regular.woff2` is the unmodified regular (400) webfont from the
official [JetBrains Mono 2.304 release](https://github.com/JetBrains/JetBrainsMono/tree/v2.304).
It is self-hosted and licensed under SIL OFL 1.1; see `JetBrainsMono-OFL.txt`.
The `--font-mono` Tailwind theme token uses this face. The Chip and MAC values
apply `font-mono`; normal interface text remains Google Sans. No external font
service is contacted at build time or in the browser.

## Updating Google Sans to a newer version

Google Fonts is currently serving version 71 of the family. To refresh the
files, request the stylesheet with a modern browser user agent:

```
https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap
```

That stylesheet is written per subset. Pick the `latin` and `latin-ext` blocks,
download the `.woff2` from each `src`, and replace the two files here with the
same names.

## If the team's licensed files should be used instead

Copy them in as `GoogleSans-Regular.woff2`, `GoogleSans-Medium.woff2` and
`GoogleSans-Bold.woff2`, then say so: the `@font-face` rules have to be pointed
at those names, since they are declared per weight rather than as a variable
font.
