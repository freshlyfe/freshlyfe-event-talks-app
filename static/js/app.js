// Global State
let releaseNotesData = [];
let selectedUpdate = null;
let currentFilter = 'all';
let currentSearch = '';
let tweetFormatIndex = 0;

// DOM Elements
const elRefreshBtn = document.getElementById('btn-refresh');
const elExportCsvBtn = document.getElementById('btn-export-csv');
const elThemeToggleBtn = document.getElementById('btn-theme-toggle');
const elSearchInput = document.getElementById('search-input');
const elClearSearchBtn = document.getElementById('btn-clear-search');
const elFilterTabs = document.querySelectorAll('.filter-tab');
const elFeedLoader = document.getElementById('feed-loader');
const elErrorState = document.getElementById('error-state');
const elErrorMessage = document.getElementById('error-message');
const elRetryBtn = document.getElementById('btn-retry');
const elEmptyState = document.getElementById('empty-state');
const elClearFiltersBtn = document.getElementById('btn-clear-filters');
const elFeedContainer = document.getElementById('feed-container');

// Stats Elements
const elFeaturesCount = document.querySelector('#stat-features .stat-count');
const elDeprecationsCount = document.querySelector('#stat-deprecations .stat-count');
const elFixesCount = document.querySelector('#stat-fixes .stat-count');

// Drawer Elements
const elTweetDrawer = document.getElementById('tweet-drawer');
const elDrawerBackdrop = document.getElementById('drawer-backdrop');
const elCloseDrawerBtn = document.getElementById('btn-close-drawer');
const elDrawerTypeBadge = document.getElementById('drawer-type-badge');
const elDrawerDate = document.getElementById('drawer-date');
const elTweetTextarea = document.getElementById('tweet-textarea');
const elTweetCharCounter = document.getElementById('tweet-char-counter');
const elCopyTweetBtn = document.getElementById('btn-copy-tweet');
const elCopyBtnText = document.getElementById('copy-btn-text');
const elSendTweetBtn = document.getElementById('btn-send-tweet');
const elGenerateAiBtn = document.getElementById('btn-generate-ai');

// Fetch notes from Flask API
async function fetchReleaseNotes() {
    toggleLoading(true);
    try {
        const response = await fetch('/api/notes');
        const data = await response.json();
        
        if (data.status === 'success') {
            releaseNotesData = data.entries;
            calculateStats(releaseNotesData);
            renderFeed();
            toggleLoading(false);
        } else {
            showError(data.message || 'An error occurred while loading notes.');
        }
    } catch (error) {
        showError('Could not establish connection to the backend server.');
        console.error(error);
    }
}

// Stats Calculation
function calculateStats(entries) {
    let features = 0;
    let deprecations = 0;
    let fixes = 0;

    entries.forEach(entry => {
        entry.updates.forEach(update => {
            const type = update.type.toLowerCase();
            if (type.includes('feature')) features++;
            else if (type.includes('deprecation')) deprecations++;
            else if (type.includes('bug fix') || type.includes('fix')) fixes++;
        });
    });

    // Animate stats values
    animateValue(elFeaturesCount, 0, features, 800);
    animateValue(elDeprecationsCount, 0, deprecations, 800);
    animateValue(elFixesCount, 0, fixes, 800);
}

// Animate numbers for premium dashboard feel
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// UI State Management
function toggleLoading(isLoading) {
    if (isLoading) {
        elRefreshBtn.classList.add('spinning');
        elRefreshBtn.disabled = true;
        elFeedLoader.style.display = 'flex';
        elFeedContainer.style.display = 'none';
        elErrorState.style.display = 'none';
        elEmptyState.style.display = 'none';
    } else {
        elRefreshBtn.classList.remove('spinning');
        elRefreshBtn.disabled = false;
        elFeedLoader.style.display = 'none';
    }
}

function showError(message) {
    toggleLoading(false);
    elErrorMessage.textContent = message;
    elErrorState.style.display = 'flex';
    elFeedContainer.style.display = 'none';
    elEmptyState.style.display = 'none';
}

// HTML to Plain Text Converter for Tweet Summarizer
function cleanHtmlForTweet(htmlStr) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlStr;
    
    // Convert links to text followed by their href
    const links = tempDiv.querySelectorAll('a');
    links.forEach(link => {
        const href = link.getAttribute('href');
        // If it's a relative link, prefix Google docs url
        const absoluteHref = href.startsWith('http') ? href : `https://docs.cloud.google.com${href}`;
        link.replaceWith(`${link.textContent} (${absoluteHref})`);
    });

    let text = tempDiv.textContent || tempDiv.innerText || "";
    // Replace multiple spaces/newlines with single space
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

// Format the tweet draft using different structures
function generateTweetText(update, date, link, formatIdx = 0) {
    const rawText = cleanHtmlForTweet(update.content);
    const typeLabel = update.type.toUpperCase();
    const cleanLink = link || "https://docs.cloud.google.com/bigquery/docs/release-notes";
    
    // We want the tweet to be safe under 280 chars, so we truncate description if needed
    // URL length is counted as 23 chars by Twitter.
    // Let's allocate 23 chars for the link and some for badges/formatting.
    const reservedLength = 60; // badges, emojis, hashtags, link
    const maxDescLength = 280 - reservedLength;
    
    let desc = rawText;
    if (desc.length > maxDescLength) {
        desc = desc.substring(0, maxDescLength - 3) + '...';
    }

    const formats = [
        `🚨 BigQuery Update | ${update.type}\n\n${desc}\n\nRead more: ${cleanLink} #BigQuery #GoogleCloud`,
        `New BigQuery ${update.type} (${date}):\n\n"${desc}"\n\nDetails: ${cleanLink} #GCP #DataWarehouse`,
        `💡 BigQuery ${update.type} released on ${date}:\n\n${desc}\n\nSource: ${cleanLink}`
    ];

    return formats[formatIdx % formats.length];
}

// Render release feed
function renderFeed() {
    elFeedContainer.innerHTML = '';
    
    let visibleEntriesCount = 0;
    
    releaseNotesData.forEach(entry => {
        // Filter the updates in this entry
        const filteredUpdates = entry.updates.filter(update => {
            const matchesFilter = currentFilter === 'all' || 
                (currentFilter === 'other' && !['feature', 'deprecation', 'bug fix'].includes(update.type.toLowerCase())) ||
                update.type.toLowerCase() === currentFilter;
                
            const cleanText = cleanHtmlForTweet(update.content).toLowerCase();
            const matchesSearch = currentSearch === '' || 
                cleanText.includes(currentSearch.toLowerCase()) || 
                update.type.toLowerCase().includes(currentSearch.toLowerCase()) ||
                entry.date.toLowerCase().includes(currentSearch.toLowerCase());
                
            return matchesFilter && matchesSearch;
        });

        if (filteredUpdates.length > 0) {
            visibleEntriesCount++;
            
            // Create Entry Card Container
            const entrySection = document.createElement('div');
            entrySection.className = 'entry-section';
            
            // Header
            const header = document.createElement('div');
            header.className = 'entry-header';
            header.innerHTML = `
                <h2 class="entry-date">${entry.date}</h2>
                <a href="${entry.link}" target="_blank" class="entry-link">
                    Official Release <i class="fa-solid fa-up-right-from-square"></i>
                </a>
            `;
            entrySection.appendChild(header);
            
            // Updates list
            filteredUpdates.forEach(update => {
                const updateItem = document.createElement('div');
                updateItem.className = 'update-item';
                
                // Add unique select class if this is active
                if (selectedUpdate && selectedUpdate.id === entry.id && selectedUpdate.content === update.content) {
                    updateItem.className += ' selected';
                }
                
                // Determine Badge Class
                let badgeClass = 'badge-other';
                const lowerType = update.type.toLowerCase();
                if (lowerType.includes('feature')) badgeClass = 'badge-feature';
                else if (lowerType.includes('deprecation')) badgeClass = 'badge-deprecation';
                else if (lowerType.includes('bug fix') || lowerType.includes('fix')) badgeClass = 'badge-bug-fix';
                
                updateItem.innerHTML = `
                    <div class="update-item-header">
                        <span class="badge ${badgeClass}">${update.type}</span>
                        <div class="card-actions-wrapper">
                            <button class="btn-card-copy" title="Copy plain text to clipboard">
                                <i class="fa-regular fa-copy"></i>
                            </button>
                            <span class="card-tweet-indicator">
                                <i class="fa-brands fa-x-twitter"></i> Click to Tweet
                            </span>
                        </div>
                    </div>
                    <div class="update-body">${update.content}</div>
                `;
                
                // Add click listener for card copy button
                const copyBtn = updateItem.querySelector('.btn-card-copy');
                copyBtn.addEventListener('click', async (e) => {
                    e.stopPropagation(); // Prevent opening the tweet drawer
                    const plainText = cleanHtmlForTweet(update.content);
                    try {
                        await navigator.clipboard.writeText(plainText);
                        copyBtn.classList.add('copied');
                        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                        setTimeout(() => {
                            copyBtn.classList.remove('copied');
                            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                        }, 2000);
                    } catch (err) {
                        console.error('Failed to copy card content: ', err);
                    }
                });

                // Click to select and compose tweet
                updateItem.addEventListener('click', (e) => {
                    // Prevent drawer open if user is clicking on links or copy buttons in card
                    if (e.target.tagName === 'A' || e.target.closest('.btn-card-copy')) return;
                    
                    selectUpdate(update, entry, updateItem);
                });
                
                entrySection.appendChild(updateItem);
            });
            
            elFeedContainer.appendChild(entrySection);
        }
    });
    
    // Toggle Empty state
    if (visibleEntriesCount === 0) {
        elFeedContainer.style.display = 'none';
        elEmptyState.style.display = 'flex';
    } else {
        elFeedContainer.style.display = 'flex';
        elEmptyState.style.display = 'none';
    }
}

// Select an update card
function selectUpdate(update, entry, element) {
    // Clear previous selection
    document.querySelectorAll('.update-item').forEach(el => el.classList.remove('selected'));
    
    // Set selection state
    selectedUpdate = {
        id: entry.id,
        date: entry.date,
        link: entry.link,
        type: update.type,
        content: update.content
    };
    
    element.classList.add('selected');
    
    // Open Compose Drawer
    openTweetDrawer();
}

// Open tweet drawer
function openTweetDrawer() {
    if (!selectedUpdate) return;
    
    tweetFormatIndex = 0; // Reset format selection
    
    // Set badge style
    let badgeClass = 'badge-other';
    const lowerType = selectedUpdate.type.toLowerCase();
    if (lowerType.includes('feature')) badgeClass = 'badge-feature';
    else if (lowerType.includes('deprecation')) badgeClass = 'badge-deprecation';
    else if (lowerType.includes('bug fix') || lowerType.includes('fix')) badgeClass = 'badge-bug-fix';
    
    elDrawerTypeBadge.className = `context-type ${badgeClass}`;
    elDrawerTypeBadge.textContent = selectedUpdate.type;
    elDrawerDate.textContent = selectedUpdate.date;
    
    // Generate draft tweet
    const draftTweet = generateTweetText(selectedUpdate, selectedUpdate.date, selectedUpdate.link, tweetFormatIndex);
    elTweetTextarea.value = draftTweet;
    
    // Update count
    updateCharCounter();
    
    // Show drawer
    elTweetDrawer.classList.add('open');
    elDrawerBackdrop.classList.add('open');
}

// Close tweet drawer
function closeTweetDrawer() {
    elTweetDrawer.classList.remove('open');
    elDrawerBackdrop.classList.remove('open');
    // Clear highlight selection
    document.querySelectorAll('.update-item').forEach(el => el.classList.remove('selected'));
    selectedUpdate = null;
}

// Character counter rules
function updateCharCounter() {
    const textLength = elTweetTextarea.value.length;
    const remaining = 280 - textLength;
    elTweetCharCounter.textContent = remaining;
    
    elTweetCharCounter.className = 'char-counter';
    if (remaining < 40 && remaining >= 0) {
        elTweetCharCounter.classList.add('warning');
    } else if (remaining < 0) {
        elTweetCharCounter.classList.add('danger');
    }
}

// Event Listeners
elRefreshBtn.addEventListener('click', fetchReleaseNotes);
elRetryBtn.addEventListener('click', fetchReleaseNotes);

// Search Logic (with subtle debounce)
let searchTimeout;
elSearchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    
    // Toggle clear search button visibility
    if (currentSearch.length > 0) {
        elClearSearchBtn.style.display = 'block';
    } else {
        elClearSearchBtn.style.display = 'none';
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        renderFeed();
    }, 150);
});

elClearSearchBtn.addEventListener('click', () => {
    elSearchInput.value = '';
    currentSearch = '';
    elClearSearchBtn.style.display = 'none';
    renderFeed();
});

elClearFiltersBtn.addEventListener('click', () => {
    elSearchInput.value = '';
    currentSearch = '';
    elClearSearchBtn.style.display = 'none';
    
    elFilterTabs.forEach(t => t.classList.remove('active'));
    elFilterTabs[0].classList.add('active');
    currentFilter = 'all';
    
    renderFeed();
});

// Category Filter Logic
elFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        elFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter');
        renderFeed();
    });
});

// Close Drawer
elCloseDrawerBtn.addEventListener('click', closeTweetDrawer);
elDrawerBackdrop.addEventListener('click', closeTweetDrawer);

// Textarea input
elTweetTextarea.addEventListener('input', updateCharCounter);

// Copy to Clipboard
elCopyTweetBtn.addEventListener('click', async () => {
    const tweetText = elTweetTextarea.value;
    try {
        await navigator.clipboard.writeText(tweetText);
        
        // Success animation
        elCopyBtnText.textContent = 'Copied!';
        elCopyTweetBtn.style.borderColor = 'var(--color-feature)';
        elCopyTweetBtn.style.color = 'var(--color-feature)';
        
        setTimeout(() => {
            elCopyBtnText.textContent = 'Copy Text';
            elCopyTweetBtn.style.borderColor = '';
            elCopyTweetBtn.style.color = '';
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
});

// Send Tweet / Open Intent link
elSendTweetBtn.addEventListener('click', () => {
    const tweetText = elTweetTextarea.value;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(tweetUrl, '_blank');
});

// Dynamic layout suggester
elGenerateAiBtn.addEventListener('click', () => {
    if (!selectedUpdate) return;
    tweetFormatIndex++;
    const draftTweet = generateTweetText(selectedUpdate, selectedUpdate.date, selectedUpdate.link, tweetFormatIndex);
    elTweetTextarea.value = draftTweet;
    updateCharCounter();
});

// Export Filtered Release Notes to CSV
function exportFilteredToCSV() {
    if (releaseNotesData.length === 0) {
        alert("No release notes loaded to export.");
        return;
    }

    const headers = ["Date", "Type", "Update Description", "Source Link"];
    const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(",")];

    releaseNotesData.forEach(entry => {
        entry.updates.forEach(update => {
            const matchesFilter = currentFilter === 'all' || 
                (currentFilter === 'other' && !['feature', 'deprecation', 'bug fix'].includes(update.type.toLowerCase())) ||
                update.type.toLowerCase() === currentFilter;
                
            const cleanText = cleanHtmlForTweet(update.content).toLowerCase();
            const matchesSearch = currentSearch === '' || 
                cleanText.includes(currentSearch.toLowerCase()) || 
                update.type.toLowerCase().includes(currentSearch.toLowerCase()) ||
                entry.date.toLowerCase().includes(currentSearch.toLowerCase());
                
            if (matchesFilter && matchesSearch) {
                const plainText = cleanHtmlForTweet(update.content);
                const row = [
                    entry.date,
                    update.type,
                    plainText,
                    entry.link
                ];
                csvRows.push(row.map(field => `"${field.replace(/"/g, '""')}"`).join(","));
            }
        });
    });

    if (csvRows.length <= 1) {
        alert("No filtered updates match the current view to export.");
        return;
    }

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const dateStamp = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `bigquery_release_notes_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Bind Export Event
if (elExportCsvBtn) {
    elExportCsvBtn.addEventListener('click', exportFilteredToCSV);
}

// Theme Toggle Logic
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

function setTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (elThemeToggleBtn) {
            elThemeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            elThemeToggleBtn.title = 'Switch to Dark Mode';
        }
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (elThemeToggleBtn) {
            elThemeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            elThemeToggleBtn.title = 'Switch to Light Mode';
        }
        localStorage.setItem('theme', 'dark');
    }
}

if (elThemeToggleBtn) {
    elThemeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchReleaseNotes();
});
