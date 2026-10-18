# Fonts

The interface is set in **Google Sans**.

Google Sans is a licensed typeface that ships with Google's own products. It is
not on Google Fonts and it is not installed on this machine, so the pages
currently fall back to the next family in the stack (`Product Sans`, then
`DM Sans`, then the system font).

## To switch the interface to Google Sans

Copy the licensed files into this folder using these exact names:

```
public/fonts/GoogleSans-Regular.woff2
public/fonts/GoogleSans-Medium.woff2
public/fonts/GoogleSans-Bold.woff2
```

`.ttf` files with the same names work as well. Nothing else has to change: the
`@font-face` rules in `src/app/globals.css` look for these paths and the whole
interface picks the font up on the next reload.

If you only have one weight, drop in `GoogleSans-Regular` and leave the others:
the browser will use the closest available weight.

Until the files are added, the browser logs a 404 for each font file it looks
for. That is expected and disappears as soon as the files are in place.

## If the licensed files are not available

The closest freely available substitute is **DM Sans**, which is already second
in the fallback stack and is served by Google Fonts. Tell the team and it can be
added as a self-hosted font in one step.

Do not commit the font files to a public repository unless the licence allows
it.
