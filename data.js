// KambuChia — split the bills for any occasion. Everything the site shows lives here.
// Swish numbers are stored scrambled (reversed + base64) so they never sit in the page as plain
// text; app.js unscrambles them only to build a QR code or a payment link.
// Numbers still missing: see NUMBERS.md.

// Everyone who has ever been to a KambuChia event. face: a square photo (none → initials).
window.PEOPLE = [
  { id: 'nam', name: 'Nam', color: '#2f7de1', face: 'media/people/nam.jpg', pay: [{ kind: 'swish', n: 'MjU4NTQ2NTI3NjQ=' }] },
  { id: 'tracy', name: 'Tracy', color: '#1f9e89', face: 'media/people/tracy.jpg', pay: [] },
  { id: 'jane', name: 'Jane', color: '#e08a1e', face: 'media/people/jane.jpg', pay: [] },
  { id: 'emma', name: 'Emma', color: '#d94f8a', face: 'media/people/emma.jpg', pay: [{ kind: 'swish', n: 'MzIzMTQ1NTY3NjQ=' }] },
  { id: 'dauto', name: 'Dauto', color: '#7a5af0', face: 'media/people/dauto.jpg', pay: [] },
  { id: 'joakim', name: 'Joakim', color: '#c0392b', face: 'media/people/joakim.jpg', pay: [] },
  { id: 'huy', name: 'Huy', color: '#0e8fb3', face: 'media/people/huy.jpg', pay: [] },
  { id: 'toan', name: 'Toan', color: '#5d6d7e', face: 'media/people/toan.jpg', pay: [] },
  { id: 'tony', name: 'Tony', color: '#8e6c3a', face: 'media/people/tony.jpg', pay: [] },
  { id: 'son', name: 'Son', color: '#2e8b57', face: 'media/people/son.jpg', pay: [] },
  { id: 'xuan', name: 'Spring', color: '#e0457b', face: 'media/people/spring.jpg', pay: [] },
  { id: 'thu', name: 'Autumn', color: '#b0762b', face: 'media/people/autumn.jpg', pay: [] },
];

// Newest first: the site opens on EVENTS[0].
// crew: who splits; hub (optional): everyone settles through them; bills.for (optional): who
// shares that bill (default: the crew); bills.own: the payer's own items, taken off before splitting.
// payments made: { from, to, kr, date, photo }. photos[0] is the cover; more go to the gallery.
window.EVENTS = [
  {
    id: 'activate-hotpot',
    title: 'Activate Hotpot',
    date: '2026-11-14',
    crew: ['joakim', 'emma', 'dauto', 'huy', 'toan', 'jane', 'tony', 'son', 'nam', 'tracy', 'xuan', 'thu'],
    bills: [
      { by: 'jane', what: 'Activate', sub: 'Game', icon: '🎮', kr: 750 },
      { by: 'dauto', what: 'Activate', sub: 'Game', icon: '🎮', kr: 375 },
      { by: 'tracy', what: 'Hemköp', sub: 'Mall of Scandinavia · meat & drinks', icon: '🥩', kr: 832.64, own: 116.08, ownWhat: 'kamben ×3', photo: 'media/receipts/hemkop.jpg' },
      { by: 'emma', what: 'ICA Kvantum', sub: 'Mall of Scandinavia · veggies & tofu', icon: '🥬', kr: 308.20, photo: 'media/receipts/ica-mos.jpg' },
      { by: 'tracy', what: 'ICA Supermarket', sub: 'Vanadis · drinks, chips & ice', icon: '🥤', kr: 225.86, photo: 'media/receipts/ica-vanadis.jpg' },
      { by: 'xuan', what: 'Snacks', icon: '🍿', kr: 135 },
    ],
    payments: [],
    photos: [
      { src: 'media/gallery/1.jpg', thumb: 'media/gallery/1-t.jpg', alt: 'The crew at Activate' },
    ],
  },
];
