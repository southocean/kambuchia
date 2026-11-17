# Swish numbers still needed

Nam will supply these. Until a number is in, that person's pay popup says
"Swish number is on its way" instead of showing a QR code.

Needed now (they get paid for Activate Hotpot):

- [ ] Tracy
- [ ] Jane

Wanted too: Spring (Xuan), since Dauto passes her share on at home.

Later (only if they ever pay a bill): Joakim, Huy, Toan, Tony, Son, Autumn (Thu).

Have it: Nam, Emma, Dauto.

Numbers go in `data.js` → `PEOPLE[].pay` as `{ kind: 'swish', n: '<scrambled>' }`
(the number with country code, e.g. 46701234567, reversed, then base64).
