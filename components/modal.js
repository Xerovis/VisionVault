const DETAIL_FIELDS = [
  ['author', 'Author'],
  ['year', 'Year'],
  ['type', 'Type'],
  ['annotation_type', 'Annotation'],
  ['modality', 'Modality'],
  ['license', 'License'],
  ['classes', 'Classes'],
  ['samples', 'Samples'],
  ['size', 'Size']
];

export function createModalController({ dialog, body, closeSelectors = [] }) {
  closeSelectors.forEach((selector) => {
    dialog.querySelectorAll(selector).forEach((node) => {
      node.addEventListener('click', () => close());
    });
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog.open) close();
  });

  function open(dataset, isFavorite, preview = {}) {
    body.innerHTML = '';
    const imageSrc = preview.imageSrc || dataset.thumbnail || '';
    const fallbackImageSrc = preview.fallbackImageSrc || imageSrc;

    const stats = DETAIL_FIELDS.map(
      ([key, label]) => `<div class="modal-stat"><span>${label}</span><strong>${dataset[key] ?? '—'}</strong></div>`
    ).join('');

    const links = [
      ['website', 'Website'],
      ['paper', 'Paper'],
      ['github', 'GitHub']
    ]
      .filter(([key]) => Boolean(dataset[key]))
      .map(([key, label]) => `<a href="${dataset[key]}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      .join('');

    body.innerHTML = `
      <section class="modal-head">
        <img src="${imageSrc}" alt="${dataset.title}" loading="lazy" />
        <div class="modal-head__info">
          <h2>${dataset.title}</h2>
          <p>${dataset.description || ''}</p>
          <p><strong>Featured:</strong> ${dataset.featured ? 'Yes' : 'No'} · <strong>Added by:</strong> ${dataset.added_by || 'community'}</p>
          <p><strong>Last updated:</strong> ${dataset.last_updated || 'unknown'}</p>
          <p><strong>Favorite:</strong> ${isFavorite ? 'Saved' : 'Not saved'}</p>
          <div class="modal-links">${links || '<span>No external links available.</span>'}</div>
        </div>
      </section>
      <section class="modal-grid">${stats}</section>
      <section>
        <h3>Tags</h3>
        <p>${(dataset.tags || []).join(', ') || 'No tags listed.'}</p>
      </section>
      <section>
        <h3>Citation</h3>
        <p>${dataset.citation || 'Citation not provided.'}</p>
      </section>
      <section>
        <h3>JSON Preview</h3>
        <pre class="json-preview">${escapeHtml(JSON.stringify(dataset, null, 2))}</pre>
      </section>
    `;

    const image = body.querySelector('.modal-head img');
    image?.addEventListener('error', () => {
      if (image.src.endsWith(fallbackImageSrc)) return;
      image.src = fallbackImageSrc;
    });

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function close() {
    if (dialog.open) {
      dialog.close();
    }
  }

  return { open, close };
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
