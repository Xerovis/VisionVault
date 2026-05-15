import { createSearchController } from "./components/search.js";
import { createFilterController } from "./components/filters.js";
import { createModalController } from "./components/modal.js";

const state = {
  index: [],
  details: new Map(),
  filtered: [],
  visibleCount: 12,
  query: "",
  sort: "recentlyAdded",
  favoritesOnly: false,
  favorites: loadFavorites(),
  filters: {
    type: [],
    annotation_type: [],
    modality: [],
    license: [],
    media: [],
    year: [],
  },
};

const sortOptions = [
  { value: "recentlyAdded", label: "Recently Added" },
  { value: "yearDesc", label: "Year (Newest)" },
  { value: "yearAsc", label: "Year (Oldest)" },
  { value: "alphabeticalAsc", label: "Alphabetical (A-Z)" },
  { value: "alphabeticalDesc", label: "Alphabetical (Z-A)" },
  { value: "samplesDesc", label: "Samples (High-Low)" },
  { value: "sizeDesc", label: "Dataset Size (Largest)" },
];

const els = {
  grid: document.querySelector("#dataset-grid"),
  cardTemplate: document.querySelector("#dataset-card-template"),
  searchInput: document.querySelector("#search-input"),
  suggestions: document.querySelector("#search-suggestions"),
  sortSelect: document.querySelector("#sort-select"),
  sortLabel: document.querySelector("#sort-select-label"),
  sortOptions: document.querySelector("#sort-options"),
  clearFilters: document.querySelector("#clear-filters"),
  filters: document.querySelector(".filters"),
  resultCount: document.querySelector("#result-count"),
  emptyState: document.querySelector("#empty-state"),
  stats: document.querySelector("#hero-stats"),
  sentinel: document.querySelector("#scroll-sentinel"),
  favoritesToggle: document.querySelector("#favorites-toggle"),
  modal: document.querySelector("#dataset-modal"),
  modalBody: document.querySelector("#modal-body"),
};

const filterController = createFilterController({
  root: els.filters,
  onChange: (selected) => {
    state.filters = selected;
    applyAndRender();
  },
});

const searchController = createSearchController({
  input: els.searchInput,
  suggestions: els.suggestions,
  onQueryChange: (query) => {
    state.query = query;
    applyAndRender();
  },
  onSuggestionPick: (query) => {
    state.query = query;
    applyAndRender();
  },
});

const modalController = createModalController({
  dialog: els.modal,
  body: els.modalBody,
  closeSelectors: ["[data-modal-close]"],
});

bootstrap().catch((error) => {
  console.error(error);
  els.grid.innerHTML = '<p class="empty-state">Failed to load datasets.</p>';
});

async function bootstrap() {
  state.index = await fetchJson("./data/index.json");
  renderHeaderStats();
  renderFilterOptions();
  renderSortOptions();
  applyAndRender();
  wireInteractions();
  observeInfiniteScroll();
  initParticleField();
  scheduleDetailHydration();
}

function wireInteractions() {
  const closeSortMenu = () => {
    els.sortSelect.classList.remove("is-open");
    els.sortOptions.classList.remove("is-open");
    els.sortSelect.setAttribute("aria-expanded", "false");
  };

  const openSortMenu = () => {
    els.sortSelect.classList.add("is-open");
    els.sortOptions.classList.add("is-open");
    els.sortSelect.setAttribute("aria-expanded", "true");
  };

  els.sortSelect.addEventListener("click", () => {
    if (els.sortOptions.classList.contains("is-open")) {
      closeSortMenu();
    } else {
      openSortMenu();
    }
  });

  els.sortOptions.addEventListener("click", async (event) => {
    const option = event.target.closest("[data-sort-value]");
    if (!option) return;

    state.sort = option.dataset.sortValue;
    updateSortSelection();
    closeSortMenu();

    if (["samplesDesc", "sizeDesc", "recentlyAdded"].includes(state.sort)) {
      await ensureAllDetails();
      renderFilterOptions();
    }
    applyAndRender();
  });

  document.addEventListener("click", (event) => {
    if (
      !els.sortSelect.contains(event.target) &&
      !els.sortOptions.contains(event.target)
    ) {
      closeSortMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSortMenu();
    }
  });

  els.clearFilters.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    filterController.reset();
  });

  els.favoritesToggle.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    els.favoritesToggle.setAttribute(
      "aria-pressed",
      String(state.favoritesOnly),
    );
    applyAndRender();
  });
}

function renderSortOptions() {
  els.sortOptions.innerHTML = "";

  sortOptions.forEach((option) => {
    const li = document.createElement("li");
    const button = document.createElement("button");

    button.type = "button";
    button.className = "sort-option";
    button.dataset.sortValue = option.value;
    button.setAttribute("role", "option");
    button.textContent = option.label;

    li.append(button);
    els.sortOptions.append(li);
  });

  updateSortSelection();
}

function updateSortSelection() {
  const selected =
    sortOptions.find((option) => option.value === state.sort) || sortOptions[0];
  els.sortLabel.textContent = selected.label;

  els.sortOptions.querySelectorAll(".sort-option").forEach((button) => {
    const isActive = button.dataset.sortValue === state.sort;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function applyAndRender() {
  const query = state.query.trim().toLowerCase();
  const byQuery = state.index.filter((dataset) => {
    const detail = state.details.get(dataset.id) || {};
    const searchable = [
      dataset.title,
      dataset.author,
      dataset.type,
      dataset.year,
      dataset.short_description,
      ...(dataset.tags || []),
      detail.annotation_type,
      detail.modality,
      detail.license,
      detail.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });

  const byFilters = byQuery.filter((dataset) => passFilters(dataset));
  const byFavorites = state.favoritesOnly
    ? byFilters.filter((dataset) => state.favorites.has(dataset.id))
    : byFilters;

  state.filtered = sortDatasets(byFavorites, state.sort);
  state.visibleCount = Math.max(
    12,
    Math.min(state.visibleCount, state.filtered.length || 12),
  );

  const suggestionSource = new Set();
  state.index.forEach((dataset) => {
    const lower = dataset.title.toLowerCase();
    if (query && lower.includes(query)) suggestionSource.add(dataset.title);
    (dataset.tags || []).forEach((tag) => {
      if (query && tag.toLowerCase().includes(query)) suggestionSource.add(tag);
    });
  });
  searchController.setSuggestions([...suggestionSource]);

  renderGrid();
}

function passFilters(dataset) {
  const detail = state.details.get(dataset.id) || {};
  const media = inferMedia(detail.modality || dataset.type);

  const bag = {
    type: [dataset.type],
    annotation_type: [detail.annotation_type],
    modality: [detail.modality],
    license: [detail.license],
    media: [media],
    year: [String(dataset.year)],
  };

  return filterController.fields.every((field) => {
    const selected = state.filters[field];
    if (!selected || selected.length === 0) return true;
    return selected.some((value) => bag[field].filter(Boolean).includes(value));
  });
}

function sortDatasets(list, mode) {
  const clone = [...list];
  const numericSize = (dataset) => {
    const raw = state.details.get(dataset.id)?.size || "";
    const match = /([\d.]+)\s*(TB|GB|MB)/i.exec(raw);
    if (!match) return 0;
    const n = Number(match[1]);
    const unit = match[2].toUpperCase();
    return unit === "TB" ? n * 1024 : unit === "GB" ? n : n / 1024;
  };

  switch (mode) {
    case "yearAsc":
      return clone.sort((a, b) => a.year - b.year);
    case "yearDesc":
      return clone.sort((a, b) => b.year - a.year);
    case "alphabeticalAsc":
      return clone.sort((a, b) => a.title.localeCompare(b.title));
    case "alphabeticalDesc":
      return clone.sort((a, b) => b.title.localeCompare(a.title));
    case "samplesDesc":
      return clone.sort(
        (a, b) =>
          (state.details.get(b.id)?.samples || 0) -
          (state.details.get(a.id)?.samples || 0),
      );
    case "sizeDesc":
      return clone.sort((a, b) => numericSize(b) - numericSize(a));
    case "recentlyAdded":
    default:
      return clone.sort((a, b) => {
        const dA = new Date(
          state.details.get(a.id)?.last_updated || "1970-01-01",
        );
        const dB = new Date(
          state.details.get(b.id)?.last_updated || "1970-01-01",
        );
        return dB - dA;
      });
  }
}

function renderGrid() {
  els.grid.innerHTML = "";
  const visible = state.filtered.slice(0, state.visibleCount);

  visible.forEach((dataset) => {
    const detail = state.details.get(dataset.id);
    const node = els.cardTemplate.content.firstElementChild.cloneNode(true);

    const favButton = node.querySelector(".dataset-card__favorite");
    favButton.classList.toggle("is-active", state.favorites.has(dataset.id));
    favButton.textContent = state.favorites.has(dataset.id) ? "★" : "☆";
    favButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(dataset.id);
      favButton.classList.toggle("is-active", state.favorites.has(dataset.id));
      favButton.textContent = state.favorites.has(dataset.id) ? "★" : "☆";
      if (state.favoritesOnly && !state.favorites.has(dataset.id)) {
        applyAndRender();
      }
    });

    const image = node.querySelector(".dataset-card__image");
    image.src = dataset.thumbnail;
    image.alt = `${dataset.title} preview`;
    image.addEventListener("error", () => {
      image.src = "assets/images/fallback.svg";
    });

    node.querySelector(".dataset-card__title").textContent = dataset.title;
    node.querySelector(".dataset-card__meta").textContent =
      `${dataset.type} · ${dataset.year} · ${dataset.author}`;
    node.querySelector(".dataset-card__meta--detail").textContent = detail
      ? `${detail.annotation_type || "Unknown annotation"} · ${numberLabel(detail.samples)} samples`
      : "Load details for annotation + sample statistics";
    node.querySelector(".dataset-card__description").textContent =
      dataset.short_description;

    const tagsWrap = node.querySelector(".dataset-card__tags");
    (dataset.tags || []).slice(0, 4).forEach((tag) => {
      const span = document.createElement("span");
      span.className = "dataset-card__tag";
      span.textContent = tag;
      tagsWrap.append(span);
    });

    const openButton = node.querySelector(".dataset-card__button");
    const openCard = () => openDatasetModal(dataset.id);
    openButton.addEventListener("click", openCard);
    node.addEventListener("dblclick", openCard);

    els.grid.append(node);
  });

  els.resultCount.textContent = `${state.filtered.length} result${state.filtered.length === 1 ? "" : "s"} shown`;
  els.emptyState.classList.toggle("hidden", state.filtered.length !== 0);
}

async function openDatasetModal(id) {
  const detail = await getDatasetDetail(id);
  modalController.open(detail, state.favorites.has(id));
}

function renderHeaderStats() {
  const uniqueTypes = new Set(state.index.map((item) => item.type));
  const years = state.index.map((item) => item.year).sort((a, b) => a - b);
  els.stats.innerHTML = [
    `${state.index.length} datasets`,
    `${uniqueTypes.size} categories`,
    `${years[0]}-${years.at(-1)} coverage`,
  ]
    .map((value) => `<span>${value}</span>`)
    .join("");
}

function renderFilterOptions() {
  const options = {
    type: uniqueSorted(state.index.map((d) => d.type)),
    annotation_type: uniqueSorted(
      [...state.details.values()].map((d) => d.annotation_type),
    ),
    modality: uniqueSorted([...state.details.values()].map((d) => d.modality)),
    license: uniqueSorted([...state.details.values()].map((d) => d.license)),
    media: uniqueSorted(
      [...state.details.values()].map((d) => inferMedia(d.modality)),
    ),
    year: uniqueSorted(state.index.map((d) => String(d.year))).sort(
      (a, b) => Number(b) - Number(a),
    ),
  };
  filterController.render(options);
}

function observeInfiniteScroll() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (
          entry.isIntersecting &&
          state.visibleCount < state.filtered.length
        ) {
          state.visibleCount += 12;
          renderGrid();
        }
      });
    },
    { rootMargin: "400px 0px" },
  );
  observer.observe(els.sentinel);
}

function loadFavorites() {
  try {
    return new Set(
      JSON.parse(localStorage.getItem("visionvault:favorites") || "[]"),
    );
  } catch {
    return new Set();
  }
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
  } else {
    state.favorites.add(id);
  }
  localStorage.setItem(
    "visionvault:favorites",
    JSON.stringify([...state.favorites]),
  );
}

async function ensureAllDetails() {
  const pendingIds = state.index
    .map((dataset) => dataset.id)
    .filter((id) => !state.details.has(id));
  const results = await Promise.allSettled(
    pendingIds.map((id) => getDatasetDetail(id)),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(
        `Skipping dataset detail hydration for "${pendingIds[index]}"`,
        result.reason,
      );
    }
  });
}

function scheduleDetailHydration() {
  const hydrate = () => {
    ensureAllDetails().then(() => {
      renderFilterOptions();
      applyAndRender();
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(hydrate, { timeout: 2500 });
  } else {
    setTimeout(hydrate, 1200);
  }
}

async function getDatasetDetail(id) {
  if (state.details.has(id)) {
    return state.details.get(id);
  }
  const data = await fetchJson(`./data/datasets/${id}.json`);
  state.details.set(id, data);
  return data;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

function numberLabel(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function inferMedia(modality = "") {
  const lowered = modality.toLowerCase();
  if (lowered.includes("video")) return "Video";
  if (lowered.includes("image")) return "Image";
  return "Mixed";
}

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}

function initParticleField() {
  const canvas = document.querySelector("#particle-canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const particles = [];
  const count = 55;

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  resize();
  window.addEventListener("resize", resize);

  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.7 + 0.2,
      speedX: (Math.random() - 0.5) * 0.18,
      speedY: (Math.random() - 0.5) * 0.18,
    });
  }

  const loop = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
      if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
      ctx.beginPath();
      ctx.fillStyle = "rgba(61, 232, 255, 0.6)";
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(loop);
  };

  loop();
}
