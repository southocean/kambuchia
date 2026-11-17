// KambuChia — split the bills for any occasion. Everything the site shows lives here.
// Swish numbers are stored scrambled (reversed + base64) so they never sit in the page as plain
// text; app.js unscrambles them only to build a QR code or a payment link.
// Numbers still missing: see NUMBERS.md.

// Everyone who has ever been to a KambuChia event. face: a square photo (none → initials); photo: the full picture shown when you tap them.
window.PEOPLE = [
  { id: 'nam', name: 'Nam', color: '#2f7de1', face: 'media/people/nam.jpg', photo: 'media/gallery/1.jpg', pay: [{ kind: 'swish', n: 'MjU4NTQ2NTI3NjQ=' }] },
  { id: 'tracy', name: 'Tracy', color: '#1f9e89', face: 'media/people/tracy.jpg', photo: 'media/people/full/tracy.jpg', pay: [{ kind: 'swish', n: 'MzMxNjE1MDM3NjQ=' }] },
  { id: 'jane', name: 'Jane', color: '#e08a1e', face: 'media/people/jane.jpg', photo: 'media/people/full/jane.jpg', pay: [{ kind: 'swish', n: 'NjI4ODg1MjY3NjQ=' }] },
  { id: 'emma', name: 'Emma', color: '#d94f8a', face: 'media/people/emma.jpg', photo: 'media/people/full/emma.jpg', pay: [{ kind: 'swish', n: 'MzIzMTQ1NTY3NjQ=' }] },
  { id: 'dauto', name: 'Dauto', color: '#7a5af0', face: 'media/people/dauto.jpg', photo: 'media/people/full/dauto.jpg', pay: [{ kind: 'swish', n: 'NjE3MzU0MjM3NjQ=' }] },
  { id: 'joakim', name: 'Joakim', color: '#c0392b', face: 'media/people/joakim.jpg', photo: 'media/people/full/joakim.jpg', pay: [{ kind: 'swish', n: 'MDc3NzUzMDY3NjQ=' }] },
  { id: 'huy', name: 'Huy', color: '#0e8fb3', face: 'media/people/huy.jpg', photo: 'media/people/full/huy.jpg', pay: [] },
  { id: 'toan', name: 'Toan', color: '#5d6d7e', face: 'media/people/toan.jpg', photo: 'media/people/full/toan.jpg', pay: [] },
  { id: 'tony', name: 'Tony', color: '#8e6c3a', face: 'media/people/tony.jpg', photo: 'media/gallery/1.jpg', pay: [{ kind: 'swish', n: 'NzM3Mzg5OTA3NjQ=' }] },
  { id: 'son', name: 'Son', color: '#2e8b57', face: 'media/people/son.jpg', photo: 'media/people/full/son.jpg', pay: [{ kind: 'swish', n: 'NTY3NDE3MDA3NjQ=' }] },
  { id: 'xuan', name: 'Spring', color: '#e0457b', face: 'media/people/spring.jpg', photo: 'media/people/full/spring.jpg', pay: [] },
  { id: 'thu', name: 'Autumn', color: '#b0762b', face: 'media/people/autumn.jpg', photo: 'media/people/full/autumn.jpg', pay: [] },
];

// The only people who may send more than one Swish to settle an event (an event can set its own
// `squarers`). Everyone else sends at most one, and is never asked to pass money on.
window.SQUARERS = ['nam', 'tracy', 'jane', 'emma'];

// Couples settle as one household: one partner only pays (or is paid by) the other, and only the
// household's net amount goes out to or comes in from everyone else.
window.COUPLES = [['tony', 'tracy'], ['joakim', 'emma'], ['dauto', 'xuan']];

// Where the "I've paid" ticks are shared: the Google Apps Script web app from tools/ticks.gs
// (its /exec URL). Empty: no "I've paid" button. The local preview uses tools/serve.js instead.
window.TICKS_URL = '';

// Newest first: the site opens on EVENTS[0].
// crew: who splits; hub (optional): everyone settles through them; bills.for (optional): who
// shares that bill (default: the crew); bills.own: the payer's own items, taken off before splitting.
// payments made: { from, to, kr, date, photo }. photos[0] is the cover; more go to the gallery.
const GAME = ['emma', 'dauto', 'huy', 'toan', 'jane', 'tony', 'son', 'nam', 'tracy'];
window.EVENTS = [
  {
    id: 'activate-hotpot',
    title: 'Activate Hotpot',
    date: '2026-11-14',
    crew: ['joakim', 'emma', 'dauto', 'huy', 'toan', 'jane', 'tony', 'son', 'nam', 'tracy', 'xuan', 'thu'],
    // Joakim, Spring and Autumn skipped the game: Activate splits over the other 9 (125 kr each)
    bills: [
      { by: 'jane', what: 'Activate', sub: 'Game', icon: '🎮', for: GAME, kr: 750 },
      { by: 'dauto', what: 'Activate', sub: 'Game', icon: '🎮', for: GAME, kr: 375 },
      { by: 'tracy', what: 'Hemköp', sub: 'Mall of Scandinavia · meat & drinks', icon: '🥩', kr: 832.64, own: 116.08, ownWhat: 'kamben ×3', photo: 'media/receipts/hemkop.jpg' },
      { by: 'emma', what: 'ICA Kvantum', sub: 'Mall of Scandinavia · veggies & tofu', icon: '🥬', kr: 308.20, photo: 'media/receipts/ica-mos.jpg' },
      { by: 'tracy', what: 'ICA Supermarket', sub: 'Vanadis · drinks, chips & ice', icon: '🥤', kr: 225.86, photo: 'media/receipts/ica-vanadis.jpg' },
      { by: 'xuan', what: 'Snacks', icon: '🍿', kr: 135 },
    ],
    payments: [],
    photos: [
      { src: 'media/gallery/1.jpg', thumb: 'media/gallery/1-t.jpg', alt: 'The crew at Activate' },
      { src: 'media/gallery/2.jpg', thumb: 'media/gallery/2-t.jpg', alt: 'The hotpot spread' },
      { src: 'media/gallery/3.jpg', thumb: 'media/gallery/3-t.jpg', alt: 'Meat for the hotpot' },
      { video: true, src: 'media/gallery/v1.mp4', poster: 'media/gallery/v1.jpg', alt: 'Hotpot time' },
      { video: true, src: 'media/gallery/v2.mp4', poster: 'media/gallery/v2.jpg', alt: 'Karaoke' },
      { video: true, src: 'media/gallery/v3.mp4', poster: 'media/gallery/v3.jpg', alt: 'More karaoke' },
      { video: true, src: 'media/gallery/v4.mp4', poster: 'media/gallery/v4.jpg', alt: 'Laughing too hard' },
    ],
  },
];
