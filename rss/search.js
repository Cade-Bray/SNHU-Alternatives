const DATA_URL = 'rss/courses.json';

// Application state and element references
const state = {
  courses: {},
  courseKeys: [],
  loaded: false,
  loading: false
};

const elements = {};

/**
 * Sanitizes user input by removing spaces, dashes, and underscores, trimming whitespace, and converting to uppercase.
 * @param value - The input value to sanitize.
 * @returns {string} The sanitized input string.
 */
function sanitizeInput(value) {
  return String(value || '')
	.replace(/[\s\-_]/g, '')
	.trim()
	.toUpperCase();
}

/**
 * Escapes special HTML characters in a string to prevent XSS vulnerabilities.
 * @param value - The input value to escape.
 * @returns {string} The escaped HTML string.
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]|'/g, (match) => ({
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
  }[match]));
}

/**
 * Generates a key for alphanumeric sorting by splitting the input into numeric and non-numeric parts, converting
 * numeric parts to numbers and non-numeric parts to lowercase strings.
 * @param value - The input value to generate the key from.
 * @returns {(number|string)[]} An array of numbers and strings representing the alphanumeric key for sorting.
 */
function alphanumKey(value) {
  return String(value || '')
      .split(/([0-9]+)/)
      .map(
          (part) => (part.match(/^\d+$/) ? Number(part) : part.toLowerCase())
      );
}

/**
 * Compares two strings using alphanumeric sorting by generating keys for both and using localeCompare for string parts.
 * @param left - The first string to compare.
 * @param right - The second string to compare.
 * @returns {number} A negative number if left < right, a positive number if left > right, or 0 if they are equal in
 * alphanumeric order.
 */
function compareKeys(left, right) {
  return alphanumKey(left).toString().localeCompare(alphanumKey(right).toString());
}

/**
 * Retrieves the 'course' query parameter from the URL, sanitizes it, and returns the sanitized value.
 * @returns {string}
 */
function getQueryCourse() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeInput(params.get('course') || '');
}

/**
 * Updates the URL's 'course' query parameter to reflect the current search term without reloading the page. If a
 * courseId is provided, it sets the parameter; if not, it removes it.
 * @param courseId - The course ID to set in the URL, or an empty string to remove the parameter.
 */
function updateUrl(courseId) {
  const url = new URL(window.location.href);
  if (courseId) {
	url.searchParams.set('course', courseId);
  } else {
	url.searchParams.delete('course');
  }
  window.history.replaceState({}, '', url);
}

/**
 * Sets the status message in the UI with an optional tone (color) to indicate the type of message (e.g., 'muted' for
 * neutral, 'coffee' for success, 'danger' for errors, 'warning' for warnings).
 * @param message - The status message to display.
 * @param tone - The tone to apply to the message (default is 'muted').
 */
function setStatus(message, tone = 'muted') {
  if (!elements.statusText) {
	return;
  }
  elements.statusText.className = `small mb-0 text-${tone}`;
  elements.statusText.textContent = message;
}

/**
 * Generates the HTML markup for a loading state, which includes a spinner and a message indicating that the course
 * catalog is being loaded.
 * @returns {string} The HTML string for the loading state.
 */
function loadingMarkup() {
  return `
	<div class="loading-state">
	  <div class="spinner-border text-coffee mb-3" role="status" aria-hidden="true"></div>
	  <p class="mb-0 text-muted">Loading course catalog...</p>
	</div>
  `;
}

/**
 * Generates the HTML markup for an empty state, which includes a message prompting the user to enter a course code and
 * a suggestion to use the search box to find courses.
 * @param message - The message to display in the empty state.
 * @returns {string} The HTML string for the empty state.
 */
function emptyMarkup(message) {
  return `
	<div class="empty-state">
	  <p class="h5 fw-bold mb-2">${escapeHtml(message)}</p>
	  <p class="text-muted mb-0">Use the search box above to find a course code or partial match.</p>
	</div>
  `;
}

/**
 * Generates the HTML markup for a certification card, which displays the provider, title, and PID of a certification.
 * It also includes default values for missing information and uses the escapeHtml function to prevent XSS
 * vulnerabilities.
 * @param cert - The certification object containing provider, title, and pid properties.
 * @returns {string} The HTML string for the certification card.
 */
function certificationCard(cert) {
  return `
	<div class="cert-card card shadow-sm h-100">
	  <div class="card-body">
		<div class="provider-tag mb-2">${escapeHtml((cert.provider || 'Unknown provider').trim())}</div>
		<h3 class="h6 card-title fw-bold mb-3">${escapeHtml((cert.title || 'Untitled certification').trim())}</h3>
		<div class="small text-muted mb-0">PID: <span class="small-code">${escapeHtml(cert.pid || 'n/a')}</span></div>
	  </div>
	</div>
  `;
}

/**
 * Generates the HTML markup for a course card, which displays the course title, credits, number of matching
 * certifications, and a list of unique providers associated with the certifications. It also includes a button to view
 * certifications for the course. The function uses the escapeHtml function to prevent XSS vulnerabilities and handles
 * cases where information may be missing.
 * @param course - The course object containing title, credits, and Certifications properties.
 * @returns {string} The HTML string for the course card.
 */
function courseCard(course) {
  const certs = Array.isArray(course.Certifications) ? course.Certifications : [];
  const providers = [...new Set(certs.map((cert) => (cert.provider || '').trim()).filter(Boolean))];

  return `
	<div class="course-card card border-0 shadow-sm h-100">
	  <div class="card-body p-4">
		<div class="course-header mb-3">
		  <div>
			<span class="code-pill">${escapeHtml(course.title || '')}</span>
			<div class="mt-3">
			  <div class="small text-muted mb-1">Credits</div>
			  <span class="credits-pill">${escapeHtml(course.credits || '—')}</span>
			</div>
		  </div>
		  <span class="count-pill">${certs.length} match${certs.length === 1 ? '' : 'es'}</span>
		</div>
		<p class="mb-0 text-muted small-code">${escapeHtml(providers.slice(0, 3).join(' • ') || 'Provider information unavailable')}</p>
		<button type="button" class="course-link mt-3" data-course="${escapeHtml(course.title || '')}">View certifications</button>
	  </div>
	</div>
  `;
}

/**
 * Renders the search results for an exact course match, displaying the course ID, number of certifications, and credits.
 * It also generates a grid of certification cards for each certification associated with the course. The function uses
 * the escapeHtml function to prevent XSS vulnerabilities and handles cases where information may be missing.
 * @param courseId - The course ID that was searched for.
 * @param course - The course object containing title, credits, and Certifications properties.
 */
function renderResultsForExact(courseId, course) {
  const certifications = [...(course.Certifications || [])].sort((a, b) => compareKeys(`${a.provider || ''}${a.title || ''}`, `${b.provider || ''}${b.title || ''}`));

  elements.resultsArea.innerHTML = `
	<div class="result-shell">
	  <div class="card border-0 shadow-sm mb-4 hero-card">
		<div class="card-body p-4">
		  <div class="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-center">
			<div>
			  <div class="eyebrow text-uppercase fw-semibold mb-2">Exact match</div>
			  <h2 class="h3 fw-bold mb-2">${escapeHtml(courseId)}</h2>
			  <p class="mb-0 text-muted">${certifications.length} certification${certifications.length === 1 ? '' : 's'} currently map to this course.</p>
			</div>
			<div class="text-md-end">
			  <div class="small text-muted mb-1">Credits</div>
			  <div class="credits-pill">${escapeHtml(course.credits || '—')}</div>
			</div>
		  </div>
		</div>
	  </div>
	  <div class="cert-grid">
		${certifications.map(certificationCard).join('')}
	  </div>
	</div>
  `;
}

/**
 * Renders the search results for a partial course match, displaying the course ID, number of matching courses, and a grid
 * of course cards for each matching course. Each course card includes a button to view certifications for that course.
 * The function uses the escapeHtml function to prevent XSS vulnerabilities and handles cases where information may be
 * missing.
 * @param courseId - The partial course ID that was searched for.
 * @param matches - An array of course objects that partially match the search term, each containing title, credits,
 * and Certifications properties.
 */
function renderResultsForPartial(courseId, matches) {
  const sortedMatches = [...matches].sort((left, right) => compareKeys(left.title || '', right.title || ''));

  elements.resultsArea.innerHTML = `
	<div class="result-shell">
	  <div class="card border-0 shadow-sm mb-4 hero-card">
		<div class="card-body p-4">
		  <div class="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-md-center">
			<div>
			  <div class="eyebrow text-uppercase fw-semibold mb-2">Partial match</div>
			  <h2 class="h3 fw-bold mb-2">${escapeHtml(courseId)}</h2>
			  <p class="mb-0 text-muted">Found ${sortedMatches.length} matching course${sortedMatches.length === 1 ? '' : 's'}.</p>
			</div>
			<div class="text-md-end">
			  <div class="small text-muted mb-1">Result count</div>
			  <div class="count-pill">${sortedMatches.length}</div>
			</div>
		  </div>
		</div>
	  </div>
	  <div class="row g-3">
		${sortedMatches.map((course) => `
		  <div class="col-12 col-lg-6">
			${courseCard(course)}
		  </div>
		`).join('')}
	  </div>
	</div>
  `;

  elements.resultsArea.querySelectorAll('[data-course]').forEach((button) => {
	button.addEventListener('click', () => performSearch(button.dataset.course || ''));
  });
}

/**
 * Renders a message indicating that no certifications were found for the given course ID, along with a suggestion to
 * try a partial search. The function uses the escapeHtml function to prevent XSS vulnerabilities.
 * @param courseId - The course ID that was searched for, which yielded no results.
 */
function renderNoResults(courseId) {
  elements.resultsArea.innerHTML = `
	<div class="error-state">
	  <p class="h5 fw-bold mb-2">No certifications found for ${escapeHtml(courseId)}.</p>
	  <p class="text-muted mb-0">Try a partial search such as <strong>GEN1</strong>, <strong>IT2</strong>, or <strong>ELE</strong>.</p>
	</div>
  `;
}

/**
 * Renders the course search results based on the provided course ID. It first sanitizes the input and checks for an exact
 * match in the course data. If an exact match is found, it renders the exact match results. If no exact match is found,
 * it looks for partial matches and renders those if any are found. If no matches are found at all, it renders a message
 * indicating that no results were found. The function also updates the status message accordingly.
 * @param courseId - The course ID to search for, which may be an exact or partial match.
 */
function renderCourseSearch(courseId) {
  const normalized = sanitizeInput(courseId);

  if (!normalized) {
	elements.resultsArea.innerHTML = emptyMarkup('Enter a course code to get started.');
	setStatus(`Loaded ${state.courseKeys.length} course entries.`, 'muted');
	return;
  }

  const exact = state.courses[normalized];
  if (exact) {
	renderResultsForExact(normalized, exact);
	setStatus(`Exact match for ${normalized}.`, 'coffee');
	return;
  }

  const matches = state.courseKeys
	.filter((key) => key.includes(normalized))
	.map((key) => state.courses[key]);

  if (matches.length > 0) {
	renderResultsForPartial(normalized, matches);
	setStatus(`Partial match for ${normalized}.`, 'coffee');
	return;
  }

  renderNoResults(normalized);
  setStatus(`No matches for ${normalized}.`, 'danger');
}

/**
 * Asynchronously loads the course data from the specified DATA_URL. It checks if the data is already loaded or
 * currently loading to prevent duplicate requests. If the data is successfully loaded, it updates the application state
 * with the course data and renders the initial search results based on the URL query parameter. If there is an error
 * during loading, it displays an error message in the UI and updates the status accordingly.
 * @returns {Promise<void>} A promise that resolves when the course data has been loaded and processed, or when an error
 * has been handled.
 */
async function loadCourseData() {
  if (state.loaded || state.loading) {
	return;
  }

  state.loading = true;
  elements.resultsArea.innerHTML = loadingMarkup();

  try {
	const response = await fetch(DATA_URL, { cache: 'no-cache' });
	if (!response.ok) {
	  elements.resultsArea.innerHTML = `
		<div class="error-state">
		  <p class="h5 fw-bold mb-2">Could not load the course catalog.</p>
		  <p class="text-muted mb-0">Unable to load course data (${response.status}).</p>
		</div>
	  `;
	  setStatus('Course data failed to load.', 'danger');
	  state.loading = false;
	  return;
	}

	state.courses = await response.json();
	state.courseKeys = Object.keys(state.courses).sort(compareKeys);
	state.loaded = true;
	state.loading = false;

	const initialSearch = getQueryCourse();
	if (elements.courseInput) {
	  elements.courseInput.value = initialSearch;
	}
	renderCourseSearch(initialSearch);
  } catch (error) {
	state.loading = false;
	elements.resultsArea.innerHTML = `
	  <div class="error-state">
		<p class="h5 fw-bold mb-2">Could not load the course catalog.</p>
		<p class="text-muted mb-0">${escapeHtml(error instanceof Error ? error.message : 'Unknown error')}</p>
	  </div>
	`;
	setStatus('Course data failed to load.', 'danger');
  }
}

/**
 * Performs a search for the given raw input value by sanitizing it, updating the input field and URL, and rendering the
 * search results. This function is called when the user submits the search form or clicks on a course card button.
 * @param rawValue - The raw input value to search for, which will be sanitized before processing.
 */
function performSearch(rawValue) {
  const normalized = sanitizeInput(rawValue);
  if (elements.courseInput) {
	elements.courseInput.value = normalized;
  }
  updateUrl(normalized);
  renderCourseSearch(normalized);
}

/**
 * Copies the current page URL with the 'course' query parameter reflecting the current search term to the clipboard. If
 * the Clipboard API is available and the context is secure, it uses navigator.clipboard.writeText to copy the URL. If
 * that fails or is not available, it falls back to creating a temporary textarea element to copy the URL using
 * document.execCommand('copy'). It also updates the status message to indicate whether the copy was successful or if
 * the user needs to copy the URL manually.
 */
function copyCurrentLink() {
  const currentValue = sanitizeInput(elements.courseInput ? elements.courseInput.value : '');
  const url = new URL(window.location.href);

  if (currentValue) {
	url.searchParams.set('course', currentValue);
  } else {
	url.searchParams.delete('course');
  }

  const shareText = url.toString();
  if (navigator.clipboard && window.isSecureContext) {
	navigator.clipboard.writeText(shareText)
	  .then(() => setStatus('Link copied to clipboard.', 'coffee'))
	  .catch(() => setStatus('Unable to copy automatically. Copy the URL from the address bar.', 'warning'));
	return;
  }

  const helper = document.createElement('textarea');
  helper.value = shareText;
  helper.setAttribute('readonly', 'true');
  helper.style.position = 'absolute';
  helper.style.left = '-9999px';
  document.body.appendChild(helper);
  helper.select();
  try {
	document.execCommand('copy');
	setStatus('Link copied to clipboard.', 'coffee');
  } catch (error) {
	setStatus('Unable to copy automatically. Copy the URL from the address bar.', 'warning');
  }
  document.body.removeChild(helper);
}

/**
 * Binds event listeners to the search form, clear button, copy link button, course input field, and window popstate
 * event. The search form submission triggers a search, the clear button resets the input and results, the copy link
 * button copies the current URL to the clipboard, the course input field sanitizes user input on each change, and the
 * popstate event allows for handling browser navigation to update the search results accordingly.
 */
function bindEvents() {
  elements.searchForm.addEventListener('submit', (event) => {
	event.preventDefault();
	performSearch(elements.courseInput ? elements.courseInput.value : '');
  });

  elements.clearButton.addEventListener('click', () => {
	if (elements.courseInput) {
	  elements.courseInput.value = '';
	  elements.courseInput.focus();
	}
	updateUrl('');
	renderCourseSearch('');
  });

  elements.copyLinkButton.addEventListener('click', copyCurrentLink);

  elements.courseInput.addEventListener('input', () => {
	const normalized = sanitizeInput(elements.courseInput.value);
	if (normalized !== elements.courseInput.value) {
	  elements.courseInput.value = normalized;
	}
  });

  window.addEventListener('popstate', () => {
	const fromUrl = getQueryCourse();
	elements.courseInput.value = fromUrl;
	renderCourseSearch(fromUrl);
  });
}

/**
 * Initializes the application by selecting necessary DOM elements, binding event listeners, and loading the course
 * data. It checks for the presence of essential elements before proceeding to ensure that the application can function
 * correctly. This function is called when the DOM content is fully loaded, allowing the application to set up its state
 * and UI before user interaction.
 */
function init() {
  elements.searchForm = document.getElementById('search-form');
  elements.courseInput = document.getElementById('course-input');
  elements.clearButton = document.getElementById('clear-button');
  elements.copyLinkButton = document.getElementById('copy-link-button');
  elements.resultsArea = document.getElementById('results-area');
  elements.statusText = document.getElementById('status-text');

  if (!elements.searchForm || !elements.courseInput || !elements.resultsArea) {
	return;
  }

  bindEvents();
  loadCourseData().then();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

