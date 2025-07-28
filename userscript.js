// ==UserScript==
// @name          YTUltra++
// @namespace     http://tampermonkey.net/
// @version       1.1
// @description   YouTube enhancement script focused on removing static ad banners, with options for Shorts hiding, custom backgrounds (color or image link), and an enhanced performance mode.
// @author        sypcer
// @match         https://www.youtube.com/*
// @match         https://m.youtube.com/*
// @grant         GM_setValue
// @grant         GM_getValue
// @grant         GM_xmlhttpRequest
// @license       MIT
// @run-at        document-start // Crucial for early CSS injection and ad blocking
// ==/UserScript==

(function () {
    'use strict';

    console.log("YTUltra++: Script started.");

    // Define ad selectors globally for easy management - focused on static banners and display ads
    const AD_SELECTORS = [
        'ytd-promoted-sparkles-web-renderer', // Promoted content/banners
        'ytd-display-ad-renderer', // Generic display ads
        'ytd-ad-slot-renderer', // Various ad types, often static slots
        'top-banner-image-text-icon-buttoned-layout-view-model', // Specific banner ad
        '.ytd-promoted-sparkles-text-banner-renderer', // Another common ad banner
        'ytd-action-companion-ad-renderer', // Companion ads (often banner-like next to videos)
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]', // Engagement panel ads (can be banners)
        '#masthead-ad', // Header ad banner
        '#watch-eow-content > .pyv-afc-paywall', // Older ad/paywall elements (can appear as banners)
        'div.ytd-mealbar-promo-renderer', // Mealbar promotions (banner-like)
        'ytd-in-feed-ad-layout-renderer', // In-feed ads (banners within content feeds)
        'ytd-rich-item-renderer:has(.badge-style-type-ad)', // Promoted items on homepage grid
        'ytd-rich-item-renderer:has(ytd-ad-badge-renderer)', // Promoted items on homepage grid
        'ytd-video-renderer:has(.badge-style-type-ad)', // Promoted videos in search/sidebar (appear as sponsored cards)
        'ytd-video-renderer:has(ytd-ad-badge-renderer)', // Promoted videos in search/sidebar
        'ytd-playlist-video-renderer:has(.badge-style-type-ad)', // Promoted videos in playlists
        // More generic selectors that might catch dynamic banners/display ads
        '[class*="ad-container"]',
        '[id*="ad-wrapper"]',
        '[data-simplepd-mod="Ad"]',
        '.ad-div',
        '.GoogleActiveViewElement',
        '#panels:has(ytd-ads-engagement-panel-content-renderer)', // Engagement panel with ads
        '.yt-mealbar-promo-renderer', // Mealbar promotions
    ];
    // Define Shorts selectors
    const SHORTS_SELECTORS = [
        'ytd-rich-shelf-renderer[is-shorts]',
        'ytd-rich-grid-row #contents ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
        'ytd-guide-entry-renderer:has(a[href="/shorts"])',
        'ytd-player[player-type="SHORTS_PLAYER"]',
        'ytd-compact-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])'
    ];
    // CSS for hiding elements and general performance tweaks
    let DYNAMIC_HIDE_CSS = ``;
    // Load initial settings synchronously for immediate effect
    const settings = {
        enableAdBannerBlock: GM_getValue('enableAdBannerBlock', true),
        hideShorts: GM_getValue('hideShorts', false),
        enableCustomBackground: GM_getValue('enableCustomBackground', false),
        customBackgroundType: GM_getValue('customBackgroundType', 'color'), // 'color' or 'image'
        customBackgroundColor: GM_getValue('customBackgroundColor', '#181818'), // Default dark gray
        customBackgroundUrl: GM_getValue('customBackgroundUrl', ''), // For image URL
        enablePerformanceMode: GM_getValue('enablePerformanceMode', false),
    };

    // Construct the dynamic CSS based on initial settings
    const updateAndInjectEarlyHidingCSS = () => {
        let currentCss = ``;
        if (settings.enableAdBannerBlock) {
            currentCss += `${AD_SELECTORS.join(', ')} { display: none !important; width: 0 !important; height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }`;
            // Add specific visibility hidden for some elements for robustness
            currentCss += `
                ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
                #masthead-ad,
                #panels:has(ytd-ads-engagement-panel-content-renderer),
                .yt-mealbar-promo-renderer {
                    visibility: hidden !important;
                    height: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
            `;
        }

        // Add performance CSS if enabled
        if (settings.enablePerformanceMode) {
             currentCss += `
                /* Disable video previews on hover */
                ytd-preview-thumbnail, ytd-video-preview { display: none !important; }
                /* Remove "Up Next" Countdown Overlay */
                .ytp-upnext-autoplay-icon, .ytp-upnext-next-unmute { display: none !important; }

                /* Reduce animations and shadows for common UI elements/context menus */
                tp-yt-paper-dialog, ytd-menu-popup-renderer, ytd-popup-container,
                .ytp-popup {
                    box-shadow: none !important;
                    transition: none !important;
                    animation: none !important;
                }
                /* Also target elements that might have transitions on hover/focus */
                ytd-button-renderer, yt-formatted-string, ytd-toggle-button-renderer,
                ytd-compact-link-renderer, ytd-account-item-renderer {
                    transition: none !important;
                }
            `;
        }

        let style = document.getElementById('yt-ultra-early-hide-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'yt-ultra-early-hide-style';
            document.head.appendChild(style);
        }
        style.textContent = currentCss;
        console.log("YTUltra++: Early hiding/performance CSS injected/updated.");
    };
    // Initial injection of the hide CSS based on loaded settings
    updateAndInjectEarlyHidingCSS();
    // Utility function for debouncing
    const debounce = (func, delay) => {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

    // Store references to observers to manage them
    let mainContentObserverInstance = null;
    let backgroundStyleObserver = null; // New observer for background persistence
    let headObserver = null;
    // New observer for preloading links

    // Adds only the necessary styles for the script's UI and new features, preventing conflicts with YouTube's CSS.
    const addScopedCSS = () => {
        const css = `
            .yt-ultra-overlay {
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background-color: rgba(0, 0, 0, 0.85); z-index: 20000;
                display: none; justify-content: center;
                align-items: center;
                font-family: 'Roboto', 'Arial', sans-serif;
            }
            .yt-ultra-container {
                background-color: rgb(30, 30, 30);
                max-width: 90vw; /* Responsive max-width */
                width: 90vw; /* Initial width */
                max-height: 90vh; /* Responsive max-height */
                padding: 5vw; /* Responsive padding */
                border-radius: 16px;
                color: white; display: flex;
                flex-direction: column; align-items: center; gap: 4vw; position: relative; /* Responsive gap */
                box-sizing: border-box; /* Include padding in width/height */
                overflow-y: auto; /* Enable scrolling for smaller screens */
            }

            @media (min-width: 600px) {
                .yt-ultra-container {
                    max-width: 500px;
                    width: auto; /* Let content determine width up to max-width */
                    padding: 25px;
                    gap: 24px;
                }
            }

            @media (min-width: 900px) {
                .yt-ultra-container {
                    max-width: 640px;
                }
            }

            .yt-ultra-close-btn {
                position: absolute;
                top: 15px; right: 20px; font-size: 28px;
                color: #aaa; cursor: pointer; user-select: none; transition: color 0.2s;
            }
            .yt-ultra-close-btn:hover { color: white; }
            .yt-ultra-toggle {
                height: 1.75rem;
                width: 3.5rem; -webkit-appearance: none; appearance: none;
                position: relative; border-radius: 9999px; background-color: #4d4d4d;
                transition: background-color 0.2s ease-in-out; cursor: pointer;
            }
            .yt-ultra-toggle:checked { background-color: #2563eb; }
            .yt-ultra-toggle::before {
                content: "";
                position: absolute; top: 0.25rem; left: 0.25rem;
                height: 1.25rem; width: 1.25rem; border-radius: 9999px;
                background-color: white; transition: transform 0.2s ease-in-out;
            }
            .yt-ultra-toggle:checked::before { transform: translateX(1.75rem); }
            .yt-ultra-apply-btn {
                background-color: #2563eb;
                color: white; border: none;
                padding: 12px 32px; font-size: 1.1rem; font-weight: 600;
                border-radius: 30px; cursor: pointer; transition: background-color 0.2s;
            }
            .yt-ultra-apply-btn:hover { background-color: #1d4ed8; }

            /* --- Custom Background Styles --- */
            html.yt-ultra-custom-bg-enabled,
            body.yt-ultra-custom-bg-enabled,
            ytd-app.yt-ultra-custom-bg-enabled {
                background-color: var(--yt-ultra-bg-color, transparent) !important;
                background-image: var(--yt-ultra-bg-image, none) !important;
                background-size: var(--yt-ultra-bg-size, auto) !important;
                background-repeat: var(--yt-ultra-bg-repeat, repeat) !important;
                background-position: var(--yt-ultra-bg-position, 0% 0%) !important;
                background-attachment: var(--yt-ultra-bg-attachment, scroll) !important;
            }
            /* Ensure main containers allow custom background to show through */
            ytd-app.yt-ultra-custom-bg-enabled #frosted-glass,
            ytd-app.yt-ultra-custom-bg-enabled #page-manager,
            ytd-app.yt-ultra-custom-bg-enabled #content.ytd-app,
            ytd-app.yt-ultra-custom-bg-enabled #container.ytd-app,
            ytd-app.yt-ultra-custom-bg-enabled #content-container,
            ytd-app.yt-ultra-custom-bg-enabled #columns,
            ytd-app.yt-ultra-custom-bg-enabled #primary,
            ytd-app.yt-ultra-custom-bg-enabled #secondary,
            ytd-app.yt-ultra-custom-bg-enabled #sections.ytd-page-manager,
            ytd-app.yt-ultra-custom-bg-enabled ytd-browse,
            ytd-app.yt-ultra-custom-bg-enabled ytd-watch-flexy,
            ytd-app.yt-ultra-custom-bg-enabled ytd-comments,
            ytd-app.yt-ultra-custom-bg-enabled #guide-content,
            ytd-app.yt-ultra-custom-bg-enabled #masthead-container,
            ytd-app.yt-ultra-custom-bg-enabled ytd-masthead,
            /* Additional elements that might have opaque backgrounds */
            ytd-app.yt-ultra-custom-bg-enabled ytd-grid-renderer,
            ytd-app.yt-ultra-custom-bg-enabled ytd-video-renderer,
            ytd-app.yt-ultra-custom-bg-enabled ytd-rich-grid-renderer,
            ytd-app.yt-ultra-custom-bg-enabled ytd-two-column-browse-results-renderer,
            ytd-app.yt-ultra-custom-bg-enabled ytd-item-section-renderer,
            ytd-app.yt-ultra-custom-bg-enabled ytd-playlist-panel-renderer,
            ytd-app.yt-ultra-custom-bg-enabled #player-container,
            ytd-app.yt-ultra-custom-bg-enabled ytd-watch-next-secondary-results-renderer,
            ytd-app.yt-ultra-custom-bg-enabled .ytd-page-manager,
            ytd-app.yt-ultra-custom-bg-enabled .ytd-app,
            ytd-app.yt-ultra-custom-bg-enabled #contents,
            /* Search box background transparency */
            .ytSearchboxComponentInputBox.yt-ultra-custom-bg-enabled {
                background: transparent !important;
                /* Use shorthand for robustness */
                filter: none !important;
                /* Remove any CSS filters that might obscure background */
                backdrop-filter: none !important;
                /* Remove any backdrop filters */
            }
            /* Override potential dark themes to ensure custom background is seen */
            html.yt-ultra-custom-bg-enabled:not([dark]),
            body.yt-ultra-custom-bg-enabled:not([dark]),
            ytd-app.yt-ultra-custom-bg-enabled:not([darker-dark-theme]),
            ytd-app.yt-ultra-custom-bg-enabled:not([dark]) {
                background-color: var(--yt-ultra-bg-color) !important;
            }
        `;
        const style = document.createElement('style');
        style.id = 'yt-ultra-styles';
        document.head.appendChild(style);
        style.textContent = css;
    };

    // --- Dynamic Content Hider (Shorts Only in this function) ---
    function hideDynamicShortsContent() {
        if (settings.hideShorts) {
            SHORTS_SELECTORS.forEach(selector => {
                document.querySelectorAll(selector).forEach(element => {
                    if (element && element.parentNode) { // Check if element exists and is in DOM
                        element.remove(); // Deeper blocking: remove element from DOM
                    }
                });
            });
        }
    }

    const manageMainContentObserver = () => {
        if (mainContentObserverInstance) {
            mainContentObserverInstance.disconnect();
            mainContentObserverInstance = null;
            console.log('YTUltra++: Main content observer disconnected.');
        }

        if (settings.hideShorts) {
            console.log('YTUltra++: Initializing main content observer for dynamic Shorts hiding.');
            // Run initial check
            hideDynamicShortsContent();
            // Observe for new elements
            const debouncedHideDynamicShortsContent = debounce(hideDynamicShortsContent, 50);
            // Aggressive debounce
            mainContentObserverInstance = new MutationObserver(debouncedHideDynamicShortsContent);
            // Observe relevant root elements like #page-manager, #contents, #primary for efficiency
            const rootContainers = document.querySelectorAll('#page-manager, #contents, #primary');
            if (rootContainers.length > 0) {
                rootContainers.forEach(container => {
                    mainContentObserverInstance.observe(container, { childList: true, subtree: true });
                });
            } else {
                // Fallback to body if specific containers not found immediately
                mainContentObserverInstance.observe(document.body, { childList: true, subtree: true });
            }
            console.log('YTUltra++: Observing for dynamic Shorts content.');
        } else {
            console.log('YTUltra++: Dynamic Shorts hiding is disabled.');
        }
    };
    // --- End of Dynamic Content Hider (Shorts) ---

    // --- Custom Background/Theme Implementation ---
    const applyCustomBackground = () => {
        const root = document.documentElement;
        const body = document.body;
        const ytdApp = document.querySelector('ytd-app');
        const searchBox = document.querySelector('.ytSearchboxComponentInputBox');
        // Remove previous custom background styles first
        root.classList.remove('yt-ultra-custom-bg-enabled');
        body.classList.remove('yt-ultra-custom-bg-enabled');
        if (ytdApp) ytdApp.classList.remove('yt-ultra-custom-bg-enabled');
        if (searchBox) searchBox.classList.remove('yt-ultra-custom-bg-enabled');

        // Clear all custom properties before re-applying
        root.style.removeProperty('--yt-ultra-bg-color');
        root.style.removeProperty('--yt-ultra-bg-image');
        root.style.removeProperty('--yt-ultra-bg-size');
        root.style.removeProperty('--yt-ultra-bg-repeat');
        root.style.removeProperty('--yt-ultra-bg-position');
        root.style.removeProperty('--yt-ultra-bg-attachment');


        if (settings.enableCustomBackground) {
            root.classList.add('yt-ultra-custom-bg-enabled');
            body.classList.add('yt-ultra-custom-bg-enabled');
            if (ytdApp) ytdApp.classList.add('yt-ultra-custom-bg-enabled');
            if (searchBox) searchBox.classList.add('yt-ultra-custom-bg-enabled');

            if (settings.customBackgroundType === 'color') {
                root.style.setProperty('--yt-ultra-bg-color', settings.customBackgroundColor);
                root.style.setProperty('--yt-ultra-bg-image', 'none'); // Explicitly no image
                console.log('YTUltra++: Custom background color applied:', settings.customBackgroundColor);
            } else if (settings.customBackgroundType === 'image') {
                if (settings.customBackgroundUrl) {
                    root.style.setProperty('--yt-ultra-bg-color', 'transparent');
                    // Ensure transparent if image is present
                    root.style.setProperty('--yt-ultra-bg-image', `url("${settings.customBackgroundUrl}")`);
                    root.style.setProperty('--yt-ultra-bg-size', 'cover'); // Set to 'cover' to ensure it fills the screen
                    root.style.setProperty('--yt-ultra-bg-repeat', 'no-repeat');
                    root.style.setProperty('--yt-ultra-bg-position', 'center center'); // Centered for optimal cover
                    root.style.setProperty('--yt-ultra-bg-attachment', 'fixed');
                    // Key for wallpaper effect: remains fixed while content scrolls
                    console.log('YTUltra++: Custom background image applied:', settings.customBackgroundUrl);
                } else {
                    // No image URL provided for image type, revert to dark background
                    root.style.setProperty('--yt-ultra-bg-color', '#181818');
                    // Fallback to YouTube's dark gray
                    root.style.setProperty('--yt-ultra-bg-image', 'none');
                    // No image
                    // Reset image-specific properties
                    root.style.setProperty('--yt-ultra-bg-size', 'auto');
                    root.style.setProperty('--yt-ultra-bg-repeat', 'repeat');
                    root.style.setProperty('--yt-ultra-bg-position', '0% 0%');
                    root.style.setProperty('--yt-ultra-bg-attachment', 'scroll');
                    console.log('YTUltra++: Custom background type set to image, but no URL. Defaulting to dark background.');
                }
            }
        } else {
            console.log('YTUltra++: Custom background removed.');
        }
    };
    const initCustomBackground = () => {
        applyCustomBackground();
        manageBackgroundObserver();
        // Ensure observer is managed whenever custom background state changes
    };
    const manageBackgroundObserver = () => {
        const root = document.documentElement;
        const body = document.body;
        const ytdApp = document.querySelector('ytd-app');

        if (backgroundStyleObserver) {
            backgroundStyleObserver.disconnect();
            backgroundStyleObserver = null;
            console.log('YTUltra++: Background style observer disconnected.');
        }

        if (settings.enableCustomBackground) {
            console.log('YTUltra++: Initializing background style observer.');
            backgroundStyleObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        // Debounce re-application to prevent excessive calls, improving performance
                        debounce(applyCustomBackground, 500)(); // Increased debounce for performance
                    }
                });
            });
            // Observe relevant elements for style changes to ensure background persistence
            if (root) backgroundStyleObserver.observe(root, { attributes: true, attributeFilter: ['style'] });
            if (body) backgroundStyleObserver.observe(body, { attributes: true, attributeFilter: ['style'] });
            // Wait for ytd-app if it's not immediately available
            if (ytdApp && !ytdApp._ytUltraObserved) {
                backgroundStyleObserver.observe(ytdApp, { attributes: true, attributeFilter: ['style'] });
                ytdApp._ytUltraObserved = true; // Mark as observed to prevent re-observing
                console.log('YTUltra++: ytd-app added to background observer.');
            }
            console.log('YTUltra++: Background style observer started for root, body, and ytd-app.');
        } else {
            console.log('YTUltra++: Custom background is disabled, observer not needed.');
        }
    };
    // --- End of Custom Background/Theme Implementation ---

    // --- Performance Mode Logic (Animations/Shadows & Preloading) ---
    const manageHeadPreloadObserver = () => {
        if (headObserver) {
            headObserver.disconnect();
            headObserver = null;
        }
        if (settings.enablePerformanceMode) {
            headObserver = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && node.tagName === 'LINK') {
                                const rel = node.getAttribute('rel');
                                if (rel === 'prefetch' || rel === 'prerender') {
                                    node.remove();
                                    console.log(`YTUltra++ Performance: Removed preload link: ${rel} - ${node.href}`);
                                }
                            }
                        });
                    }
                });
            });
            headObserver.observe(document.head, { childList: true });
            console.log('YTUltra++ Performance: Head preloading observer started.');
        } else {
            console.log('YTUltra++ Performance: Head preloading observer disabled.');
        }
    };

    const applyPerformanceTweaks = () => {
        // This function primarily orchestrates the CSS injection and observer management.
        updateAndInjectEarlyHidingCSS(); // Re-inject CSS to apply/remove performance rules
        manageHeadPreloadObserver();
        // Manage the observer for preloading links
        console.log('YTUltra++: Performance Mode tweaks applied/updated.');
    };
    // --- End of Performance Mode Logic ---


    // Main MutationObserver to react to YouTube's SPA content changes
    const debouncedMainMutationCallback = debounce(() => {
        // Only run if the settings indicate dynamic hiding is needed
        if (settings.hideShorts) {
            hideDynamicShortsContent();
        }
        applyPerformanceTweaks(); // Apply performance tweaks on content changes too
        initCustomBackground(); // Re-apply custom background in case of navigation

    }, 500); // Increased debounce time for better performance

    const mainMutationObserver = new MutationObserver(debouncedMainMutationCallback);
    // Observe the #page-manager and other relevant roots, fall back to body
    const rootTargets = document.querySelectorAll('ytd-page-manager, #contents, #primary, #secondary');
    if (rootTargets.length > 0) {
        rootTargets.forEach(target => {
            mainMutationObserver.observe(target, { childList: true, subtree: true, attributes: false });
        });
    } else {
        mainMutationObserver.observe(document.body, { childList: true, subtree: true, attributes: false });
    }


    // Initial runs on load and navigation
    window.addEventListener('load', () => {
        initCustomBackground();
        manageMainContentObserver(); // Will handle initial and dynamic hiding of Shorts
        applyPerformanceTweaks(); // Apply initial performance tweaks
    });
    window.addEventListener('yt-navigate-finish', () => {
        initCustomBackground();
        manageMainContentObserver(); // Re-initialize observer for new page content (Shorts)
        applyPerformanceTweaks(); // Apply performance tweaks on navigation
    });
    // Variable to hold the single instance of the overlay
    let settingsOverlayInstance = null;
    let ultraButtonInstance = null;

    const createToggleButton = () => {
        const button = document.createElement('button');
        button.textContent = 'Ultra++';
        button.id = 'yt-ultra-toggle-btn';
        Object.assign(button.style, {
            width: '120px', height: '38px', fontWeight: 'bold', fontSize: '14px',
            cursor: 'pointer', border: 'none', borderRadius: '30px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: 'white', zIndex: '10000', marginRight: '12px',
            backdropFilter: 'blur(25px)',
            '-webkit-backdrop-filter': 'blur(25px)',
            flexShrink: '0' // Prevent shrinking
        });
        return button;
    };

    const createSettingsOverlay = () => {
        const overlay = document.createElement('div');
        overlay.id = 'yt-ultra-overlay';
        overlay.className = 'yt-ultra-overlay';

        const container = document.createElement('div');
        container.className = 'yt-ultra-container';

        const closeBtn = document.createElement('div');
        closeBtn.textContent = '✖';
        closeBtn.className = 'yt-ultra-close-btn';
        closeBtn.onclick = () => { overlay.style.display = 'none'; };
        const title = document.createElement('h2');
        title.textContent = 'YouTubeUltra++ Settings';
        Object.assign(title.style, {
            fontSize: '36px', fontWeight: '700', textAlign: 'center', userSelect: 'none',
        });
        const toggleContainer = document.createElement('div');
        Object.assign(toggleContainer.style, {
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '16px', // Reduced from 24px - gap between main sections
            width: '100%',
        });
        // Simple createToggle function (for boolean toggles)
        const createToggle = (id, labelText) => {
            const wrapper = document.createElement('div');
            Object.assign(wrapper.style, {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                width: '100%', gap: '8px',
            });
            const label = document.createElement('label');
            label.textContent = labelText;
            Object.assign(label.style, {
                fontSize: '20px', fontWeight: '600', userSelect: 'none',
            });
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = id;
            checkbox.className = 'yt-ultra-toggle';
            checkbox.checked = settings[id];
            // Event listener will be handled externally if it needs to trigger UI visibility changes
            wrapper.appendChild(label);
            wrapper.appendChild(checkbox);
            return wrapper;
        };

        // Helper to create a bordered group for settings without a title
        const createBorderlessSettingsGroupWrapper = (...contentElements) => {
            const groupWrapper = document.createElement('div');
            Object.assign(groupWrapper.style, {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '10px', // Reduced from 16px
                width: '100%', border: '1px solid #333',
                borderRadius: '8px',
                padding: '10px', //
            });
            contentElements.forEach(el => groupWrapper.appendChild(el));
            return groupWrapper;
        };

        // Ad Banner Block Group
        const adBlockToggleElement = createToggle('enableAdBannerBlock', 'Block Ad Banners');
        adBlockToggleElement.querySelector('input[type="checkbox"]').onchange = (e) => {
            settings.enableAdBannerBlock = e.target.checked;
            GM_setValue('enableAdBannerBlock', e.target.checked);
            updateAndInjectEarlyHidingCSS();
        };
        toggleContainer.appendChild(createBorderlessSettingsGroupWrapper(adBlockToggleElement));

        // Hide Shorts Group
        const hideShortsToggleElement = createToggle('hideShorts', 'Hide Shorts');
        hideShortsToggleElement.querySelector('input[type="checkbox"]').onchange = (e) => {
            settings.hideShorts = e.target.checked;
            GM_setValue('hideShorts', e.target.checked);
            manageMainContentObserver();
            // Re-run observer for immediate removal
        };
        toggleContainer.appendChild(createBorderlessSettingsGroupWrapper(hideShortsToggleElement));
        // Performance Mode Group
        const performanceModeToggleElement = createToggle('enablePerformanceMode', 'Performance Mode');
        performanceModeToggleElement.querySelector('input[type="checkbox"]').onchange = (e) => {
            settings.enablePerformanceMode = e.target.checked;
            GM_setValue('enablePerformanceMode', e.target.checked);
            applyPerformanceTweaks(); // Apply/remove performance tweaks immediately
        };
        toggleContainer.appendChild(createBorderlessSettingsGroupWrapper(performanceModeToggleElement));
        // Custom Background Group
        const customBgToggleElement = createToggle('enableCustomBackground', 'Enable Custom Background');
        const customBgDetailsWrapper = document.createElement('div');
        customBgDetailsWrapper.id = 'customBgDetailsWrapper'; // Added ID
        Object.assign(customBgDetailsWrapper.style, {
            display: settings.enableCustomBackground ? 'flex' : 'none',
            flexDirection: 'column', alignItems: 'center', gap: '16px',
            width: '100%',
        });
        // Type Selection (Color/Image)
        const typeSelectionWrapper = document.createElement('div');
        Object.assign(typeSelectionWrapper.style, { display: 'flex', gap: '20px' });
        const createRadio = (name, value, labelText, checked) => {
            const radioId = `bg-type-${value}`;
            const radioWrapper = document.createElement('div');
            Object.assign(radioWrapper.style, { display: 'flex', alignItems: 'center', gap: '8px' });
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = name;
            radio.id = radioId;
            radio.value = value;
            radio.checked = checked;
            const label = document.createElement('label');
            label.htmlFor = radioId;
            label.textContent = labelText;
            Object.assign(label.style, { fontSize: '18px' });
            radioWrapper.append(radio, label);
            return { radio, radioWrapper };
        };
        const { radio: colorRadio, radioWrapper: colorRadioWrapper } = createRadio('backgroundType', 'color', 'Custom Color', settings.customBackgroundType === 'color');
        const { radio: imageRadio, radioWrapper: imageRadioWrapper } = createRadio('backgroundType', 'image', 'Image Link (JPG)', settings.customBackgroundType === 'image');

        typeSelectionWrapper.append(colorRadioWrapper, imageRadioWrapper);
        customBgDetailsWrapper.appendChild(typeSelectionWrapper);
        // Color Picker
        const colorPickerWrapper = document.createElement('div');
        colorPickerWrapper.id = 'colorPickerWrapper';
        // Added ID
        Object.assign(colorPickerWrapper.style, {
            display: settings.customBackgroundType === 'color' ? 'flex' : 'none',
            justifyContent: 'center', alignItems: 'center', width: '100%', marginTop: '0px',
        });
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = settings.customBackgroundColor;
        Object.assign(colorPicker.style, { width: '50px', height: '25px', border: 'none', borderRadius: '4px', cursor: 'pointer' });
        colorPicker.oninput = () => {
            settings.customBackgroundColor = colorPicker.value;
            GM_setValue('customBackgroundColor', colorPicker.value);
            applyCustomBackground();
        };
        colorPickerWrapper.appendChild(colorPicker);
        customBgDetailsWrapper.appendChild(colorPickerWrapper);

        // Image URL Input
        const imageUrlWrapper = document.createElement('div');
        imageUrlWrapper.id = 'imageUrlWrapper'; // Added ID
        Object.assign(imageUrlWrapper.style, {
            display: settings.customBackgroundType === 'image' ? 'flex' : 'none',
            flexDirection: 'column', width: '100%', gap: '8px',
        });
        const imageUrlLabel = document.createElement('label');
        imageUrlLabel.textContent = 'Image URL:';
        Object.assign(imageUrlLabel.style, { fontSize: '18px' });
        const imageUrlInput = document.createElement('input');
        imageUrlInput.type = 'text';
        imageUrlInput.placeholder = 'Enter JPG image URL';
        imageUrlInput.value = settings.customBackgroundUrl;
        Object.assign(imageUrlInput.style, {
            width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #555',
            backgroundColor: '#333', color: 'white', fontSize: '16px',
        });
        imageUrlInput.oninput = debounce(() => {
            settings.customBackgroundUrl = imageUrlInput.value;
            GM_setValue('customBackgroundUrl', imageUrlInput.value);
            applyCustomBackground();
        }, 300);
        imageUrlWrapper.append(imageUrlLabel, imageUrlInput);
        customBgDetailsWrapper.appendChild(imageUrlWrapper);

        // Update visibility logic for radio buttons and the main custom background section
        const updateBackgroundOptionsVisibility = () => {
            if (colorPickerWrapper) colorPickerWrapper.style.display = settings.customBackgroundType === 'color' ? 'flex' : 'none';
            if (imageUrlWrapper) imageUrlWrapper.style.display = settings.customBackgroundType === 'image' ? 'flex' : 'none';
            applyCustomBackground();
        };
        // Event listeners for radio buttons
        colorRadio.onchange = () => {
            if (colorRadio.checked) {
                settings.customBackgroundType = 'color';
                GM_setValue('customBackgroundType', 'color');
                updateBackgroundOptionsVisibility();
            }
        };
        imageRadio.onchange = () => {
            if (imageRadio.checked) {
                settings.customBackgroundType = 'image';
                GM_setValue('customBackgroundType', 'image');
                updateBackgroundOptionsVisibility();
            }
        };
        // Ensure the details wrapper shows/hides when master enableCustomBackground toggle changes
        customBgToggleElement.querySelector('input[type="checkbox"]').onchange = (e) => {
            settings.enableCustomBackground = e.target.checked;
            GM_setValue('enableCustomBackground', e.target.checked);
            if (customBgDetailsWrapper) customBgDetailsWrapper.style.display = e.target.checked ? 'flex' : 'none';
            applyCustomBackground();
            // Apply styles immediately
            manageBackgroundObserver();
            // Start/stop observer based on new setting
        };
        // Append the whole Custom Background group to toggleContainer
        toggleContainer.appendChild(createBorderlessSettingsGroupWrapper(customBgToggleElement, customBgDetailsWrapper));
        const applyButton = document.createElement('button');
        applyButton.textContent = 'Apply & Reload';
        applyButton.className = 'yt-ultra-apply-btn';
        applyButton.onclick = () => location.reload();
        container.append(closeBtn, title, toggleContainer, applyButton);
        overlay.appendChild(container);

        document.body.appendChild(overlay);
        return overlay;
    };

    addScopedCSS();
    settingsOverlayInstance = createSettingsOverlay(); // Create overlay once

    const ensureButtonPresence = () => {
        if (ultraButtonInstance && ultraButtonInstance.isConnected) {
            return; // Button is already in DOM
        }

        const mastheadButtons = document.querySelector('#buttons.ytd-masthead');
        const endButtons = document.querySelector('#end #buttons'); // Specific to new YouTube layout
        const accountButton = document.querySelector('ytd-masthead #end #account-button'); // Fallback for prepending

        let insertPoint = null;

        if (mastheadButtons) {
            insertPoint = mastheadButtons;
        } else if (endButtons) {
            insertPoint = endButtons;
        } else if (accountButton && accountButton.parentElement) {
            // Insert before the account button if #buttons container is not found directly
            insertPoint = accountButton.parentElement;
        }

        if (insertPoint) {
            if (!ultraButtonInstance) {
                ultraButtonInstance = createToggleButton();
                ultraButtonInstance.onclick = () => {
                    if (settingsOverlayInstance) {
                        settingsOverlayInstance.style.display = 'flex';
                        // Re-initialize the background options visibility for accurate display using IDs
                        const customBgDetailsWrapper = document.getElementById('customBgDetailsWrapper');
                        const colorPickerWrapper = document.getElementById('colorPickerWrapper');
                        const imageUrlWrapper = document.getElementById('imageUrlWrapper');

                        if (settings.enableCustomBackground) {
                            if (customBgDetailsWrapper) customBgDetailsWrapper.style.display = 'flex';
                            if (colorPickerWrapper) colorPickerWrapper.style.display = settings.customBackgroundType === 'color' ? 'flex' : 'none';
                            if (imageUrlWrapper) imageUrlWrapper.style.display = settings.customBackgroundType === 'image' ? 'flex' : 'none';
                        } else {
                            if (customBgDetailsWrapper) customBgDetailsWrapper.style.display = 'none';
                        }
                    }
                };
            }
            if (!ultraButtonInstance.isConnected) {
                insertPoint.prepend(ultraButtonInstance);
                console.log("YTUltra++: Button re-inserted.");
            }
        } else {
            console.log("YTUltra++: Insert point for button not found yet.");
        }
    };


    // Use a MutationObserver to ensure the button is persistently present
    const mastheadObserver = new MutationObserver(debounce(() => {
        ensureButtonPresence();
    }, 100)); // Debounce to avoid excessive calls

    // Start observing a stable parent element, like ytd-masthead
    const startButtonObserver = () => {
        const masthead = document.querySelector('ytd-masthead');
        if (masthead) {
            mastheadObserver.observe(masthead, { childList: true, subtree: true, attributes: false });
            console.log("YTUltra++: Started observing ytd-masthead for button presence.");
            ensureButtonPresence(); // Initial check
        } else {
            // If masthead isn't available immediately, try again after a short delay
            setTimeout(startButtonObserver, 500);
        }
    };


    // Call the observer starter after the DOM is ready or on navigation finishes
    window.addEventListener('load', () => {
        startButtonObserver();
        initCustomBackground();
        manageMainContentObserver();
        applyPerformanceTweaks();
    });

    window.addEventListener('yt-navigate-finish', () => {
        startButtonObserver(); // Re-check button on navigation
        initCustomBackground();
        manageMainContentObserver();
        applyPerformanceTweaks();
    });

    // Also call it immediately if possible
    startButtonObserver();

    // Ensure custom background class for search box, which might load later
    const ensureSearchBoxBackground = () => {
        const searchBox = document.querySelector('.ytSearchboxComponentInputBox');
        if (searchBox) {
            if (settings.enableCustomBackground) {
                searchBox.classList.add('yt-ultra-custom-bg-enabled');
            } else {
                searchBox.classList.remove('yt-ultra-custom-bg-enabled');
            }
        }
    };
    // Observe the search box specifically
    const searchBoxObserver = new MutationObserver(debounce(ensureSearchBoxBackground, 100));
    const startSearchBoxObserver = () => {
        const masthead = document.querySelector('ytd-masthead');
        if (masthead) {
            searchBoxObserver.observe(masthead, { childList: true, subtree: true });
            console.log("YTUltra++: Started observing ytd-masthead for search box background.");
            ensureSearchBoxBackground(); // Initial check
        } else {
            setTimeout(startSearchBoxObserver, 500);
        }
    };
    window.addEventListener('load', startSearchBoxObserver);
    window.addEventListener('yt-navigate-finish', startSearchBoxObserver);
    startSearchBoxObserver(); // Initial call
})();
