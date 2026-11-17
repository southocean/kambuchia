# KambuChia

Split the bills for any occasion: the site opens on the newest event, with who pays whom,
a Swish QR code and an Open Swish button per payment, the bills, and the photos.
Built on [Bị ốm birthday](https://github.com/southocean/bi-om-birthday).

- Everything is in `data.js`: `PEOPLE` (everyone, their face and Swish), `EVENTS` (newest first:
  crew, bills, payments made, photos).
- A bill's `own` is the payer's own items, taken off before splitting; `for` limits who shares it.
- Settling: everyone sends at most one Swish, except the squarers (`SQUARERS` in `data.js`: Nam, Tracy,
  Jane, Emma), who pass on whatever is left (Nam first). Couples (`COUPLES`) settle as one household:
  what one partner owes the other shows as a dashed "settle at home" row. Debts round up to the next krona.
  (Or set `hub` on an event to settle everything through one person.)
- Mark a payment made: add `{ from, to, kr, date, photo }` to the event's `payments` (blur phone numbers).
- Missing Swish numbers: see [NUMBERS.md](NUMBERS.md).
- Local preview: `node tools/serve.js` → http://localhost:5180
