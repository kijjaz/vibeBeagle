document.addEventListener('DOMContentLoaded', () => {
    // State management
    let compoundsData = [];
    let similarityData = {};
    let globalWeights = [];
    let selectedMolA = null;
    let selectedMolB = null;
    let spectrumChart = null;
    let networkInstance = null;
    let selectedNetNode = null;
    let activeTab = 'analyzer';
    let currentThreshold = 0.75;

    // DOM Elements - Analyzer
    const compoundList = document.getElementById('compound-list');
    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const totalCountLabel = document.getElementById('total-count-label');
    const clearBBtn = document.getElementById('clear-b-btn');
    const overlapCircle = document.getElementById('overlap-circle');
    const overlapText = document.getElementById('overlap-text');
    const overlapDesc = document.getElementById('overlap-desc');
    const legendB = document.getElementById('legend-b');
    const legendDelta = document.getElementById('legend-delta');

    // Molecule A Meta Info
    const molAName = document.getElementById('mol-a-name');
    const molACas = document.getElementById('mol-a-cas');
    const molAFormula = document.getElementById('mol-a-formula');
    const molAWeight = document.getElementById('mol-a-weight');
    const molACid = document.getElementById('mol-a-cid');
    const molAPrice = document.getElementById('mol-a-price');
    const modesListContainer = document.getElementById('modes-list-container');

    // Molecule B Meta Info
    const molBName = document.getElementById('mol-b-name');
    const molBCas = document.getElementById('mol-b-cas');
    const molBFormula = document.getElementById('mol-b-formula');
    const molBWeight = document.getElementById('mol-b-weight');
    const molBCid = document.getElementById('mol-b-cid');
    const molBPrice = document.getElementById('mol-b-price');

    // Similarity Hub Lists
    const closestList = document.getElementById('closest-list');
    const farthestList = document.getElementById('farthest-list');
    const similarityLimitSelect = document.getElementById('similarity-limit');

    // DOM Elements - Tabs
    const tabBtnAnalyzer = document.getElementById('tab-btn-analyzer');
    const tabBtnNetwork = document.getElementById('tab-btn-network');
    const tabBtnTheory = document.getElementById('tab-btn-theory');
    const tabContentAnalyzer = document.getElementById('tab-content-analyzer');
    const tabContentNetwork = document.getElementById('tab-content-network');
    const tabContentTheory = document.getElementById('tab-content-theory');

    // DOM Elements - Network Graph
    const thresholdSlider = document.getElementById('similarity-threshold');
    const thresholdValLabel = document.getElementById('threshold-val');
    const netStatNodes = document.getElementById('net-stat-nodes');
    const netStatEdges = document.getElementById('net-stat-edges');
    const selectedNodeDetails = document.getElementById('selected-node-details');
    const netNodeName = document.getElementById('net-node-name');
    const netNodeCas = document.getElementById('net-node-cas');
    const netNodeFormula = document.getElementById('net-node-formula');
    const netNodeNeighbors = document.getElementById('net-node-neighbors');
    const netSelectMainBtn = document.getElementById('net-select-main-btn');

    // DOM Elements - Shared Peaks & Filters
    const sharedPeaksDisplay = document.getElementById('shared-peaks-display');
    const sharedPeaksList = document.getElementById('shared-peaks-list');
    const gapPeaksList = document.getElementById('gap-peaks-list');
    const activeFiltersContainer = document.getElementById('active-filters-container');
    let activePeakFilter = null;

    // Tab switcher events
    tabBtnAnalyzer.addEventListener('click', () => {
        tabBtnAnalyzer.classList.add('active');
        tabBtnNetwork.classList.remove('active');
        if (tabBtnTheory) tabBtnTheory.classList.remove('active');
        tabContentAnalyzer.classList.add('active');
        tabContentNetwork.classList.remove('active');
        if (tabContentTheory) tabContentTheory.classList.remove('active');
        activeTab = 'analyzer';
        // Redraw canvas/chart when visible to prevent scaling errors
        if (spectrumChart) spectrumChart.resize();
        drawLissajous();
    });

    tabBtnNetwork.addEventListener('click', () => {
        tabBtnNetwork.classList.add('active');
        tabBtnAnalyzer.classList.remove('active');
        if (tabBtnTheory) tabBtnTheory.classList.remove('active');
        tabContentNetwork.classList.add('active');
        tabContentAnalyzer.classList.remove('active');
        if (tabContentTheory) tabContentTheory.classList.remove('active');
        activeTab = 'network';
        
        // Load the network graph once visible
        initNetworkGraph();
    });

    if (tabBtnTheory) {
        tabBtnTheory.addEventListener('click', () => {
            tabBtnTheory.classList.add('active');
            tabBtnAnalyzer.classList.remove('active');
            tabBtnNetwork.classList.remove('active');
            tabContentTheory.classList.add('active');
            tabContentAnalyzer.classList.remove('active');
            tabContentNetwork.classList.remove('active');
            activeTab = 'theory';
            
            // Trigger MathJax typeset to compile LaTeX math equations
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise();
            }
        });
    }

    // Close button for Peak Explanation Card
    const closePeakExpBtn = document.getElementById('close-peak-exp-btn');
    if (closePeakExpBtn) {
        closePeakExpBtn.addEventListener('click', () => {
            clearPeakFilter();
        });
    }

    // Clear Molecule B selection button
    if (clearBBtn) {
        clearBBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearMoleculeB();
        });
    }

    // Initialize the Chart
    function initChart() {
        try {
            if (typeof Chart === 'undefined') {
                throw new Error("Chart.js library is not loaded.");
            }
            const ctx = document.getElementById('spectrumChart').getContext('2d');
            
            // Custom vertical reference line plugin for active peak filtering
            const verticalLinePlugin = {
                id: 'verticalLine',
                afterDraw: (chart) => {
                    if (activePeakFilter && activePeakFilter.frequency) {
                        const ctxLine = chart.ctx;
                        const xAxis = chart.scales.x;
                        const yAxis = chart.scales.y;
                        const xVal = activePeakFilter.frequency;
                        const idx = chart.data.labels.findIndex(label => Math.abs(Number(label) - Number(xVal)) < 1);
                        if (idx !== -1) {
                            let xPixel = undefined;
                            const meta = chart.getDatasetMeta(0);
                            if (meta && meta.data && meta.data[idx]) {
                                xPixel = meta.data[idx].x;
                            }
                            if (xPixel === undefined || isNaN(xPixel)) {
                                xPixel = xAxis.getPixelForValue(null, idx);
                            }
                            if (xPixel === undefined || isNaN(xPixel)) {
                                xPixel = xAxis.getPixelForValue(chart.data.labels[idx], idx);
                            }
                            if (xPixel === undefined || isNaN(xPixel)) {
                                xPixel = xAxis.getPixelForValue(String(chart.data.labels[idx]));
                            }

                            if (xPixel !== undefined && !isNaN(xPixel)) {
                                ctxLine.save();
                                ctxLine.beginPath();
                                ctxLine.setLineDash([5, 5]);
                                ctxLine.moveTo(xPixel, yAxis.top);
                                ctxLine.lineTo(xPixel, yAxis.bottom);
                                ctxLine.lineWidth = 2;
                                ctxLine.strokeStyle = '#ff9f1c'; // Glowing orange line
                                ctxLine.shadowBlur = 8;
                                ctxLine.shadowColor = '#ff9f1c';
                                ctxLine.stroke();
                                ctxLine.restore();
                            }
                        }
                    }
                }
            };
            
            // Define premium grid/font styles
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 400,
                    easing: 'easeInOutQuad'
                },
                plugins: {
                    legend: {
                        display: false // We use custom legends in HTML
                    },
                    tooltip: {
                        backgroundColor: 'rgba(18, 18, 18, 0.95)',
                        titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
                        bodyFont: { family: 'Share Tech Mono', size: 12 },
                        borderColor: 'rgba(212, 175, 55, 0.2)',
                        borderWidth: 1,
                        cornerRadius: 6,
                        displayColors: true,
                        callbacks: {
                            title: (context) => `Frequency: ${context[0].label} cm⁻¹`,
                            label: (context) => {
                                const val = context.raw;
                                return ` ${context.dataset.label}: ${val.toFixed(4)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.03)'
                        },
                        ticks: {
                            color: '#606060',
                            font: { family: 'Share Tech Mono', size: 10 }
                        },
                        title: {
                            display: true,
                            text: 'Wavenumber (cm⁻¹)',
                            color: '#a0a0a0',
                            font: { family: 'Inter', size: 11 }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.03)'
                        },
                        ticks: {
                            color: '#606060',
                            font: { family: 'Share Tech Mono', size: 10 }
                        },
                        title: {
                            display: true,
                            text: 'Arbitrary Intensity',
                            color: '#a0a0a0',
                            font: { family: 'Inter', size: 11 }
                        },
                        suggestedMax: 2.0
                    }
                }
            };

            spectrumChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: chartOptions,
                plugins: [verticalLinePlugin]
            });
        } catch (e) {
            console.error("Failed to initialize Chart.js:", e);
            const container = document.querySelector('.chart-container');
            if (container) {
                container.innerHTML = `<div class="empty-state" style="color: var(--gold); padding: 40px; text-align: center;">
                    <p style="font-size: 1.2rem; font-weight: bold; margin-bottom: 8px;">Chart Visualization Unavailable</p>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">Chart.js library is not available. Please verify that chart.js exists in the project directory.</p>
                </div>`;
            }
        }
    }

    // Load dataset JSON files
    async function loadData() {
        try {
            const [respVibrations, respSimilarity] = await Promise.all([
                fetch('aroma_vibrations.json'),
                fetch('similarity_report.json')
            ]);
            
            compoundsData = await respVibrations.json();
            
            // Dynamically generate and inject spectrum_grid since it was removed from the database for file-size optimization (saving 1.8MB)
            const globalGrid = [];
            for (let f = 400.0; f <= 4000.0; f += 10.0) {
                globalGrid.push(f);
            }
            compoundsData.forEach(comp => {
                comp.spectrum_grid = globalGrid;
            });
            
            // Generate global weights vector for weighted cosine similarity
            const BANDS = [
                { name: "Skeletal_Bends", start: 400.0, end: 700.0, weight: 1.25 },
                { name: "Alkene_OOP", start: 700.0, end: 1000.0, weight: 1.35 },
                { name: "C_O_Stretches", start: 1000.0, end: 1300.0, weight: 1.60 },
                { name: "Alkyl_Deforms", start: 1300.0, end: 1400.0, weight: 0.65 },
                { name: "Aromatic_Double", start: 1400.0, end: 1650.0, weight: 1.0231 },
                { name: "Carbonyl", start: 1650.0, end: 1800.0, weight: 1.5616 },
                { name: "Triple_Nitrile", start: 2100.0, end: 2260.0, weight: 15.0000 },
                { name: "Thiol", start: 2500.0, end: 2600.0, weight: 0.1898 },
                { name: "Aliphatic_CH", start: 2800.0, end: 3000.0, weight: 0.3528 },
                { name: "Aromatic_CH", start: 3000.0, end: 3150.0, weight: 0.7438 },
                { name: "Hydroxyl", start: 3150.0, end: 3650.0, weight: 0.0425 }
            ];
            
            globalWeights = [];
            for (let f = 400.0; f <= 4000.0; f += 10.0) {
                let w = 1.0;
                for (let b = 0; b < BANDS.length; b++) {
                    const band = BANDS[b];
                    if (f >= band.start && f <= band.end) {
                        w = band.weight;
                        break;
                    }
                }
                globalWeights.push(w);
            }
            
            similarityData = await respSimilarity.json();
            
            totalCountLabel.textContent = `${compoundsData.length} pure aroma chemicals ready`;
            
            // Populate Directory
            renderDirectory(compoundsData);
            
            // Select first compound by default as Molecule A
            if (compoundsData.length > 0) {
                selectMoleculeA(compoundsData[0]);
            }
        } catch (error) {
            console.error("Error loading data files:", error);
            totalCountLabel.textContent = "Error loading data. Run simulation first.";
            compoundList.innerHTML = `<li class="empty-state" style="color: #ff5b5b;">Failed to load JSON databases. Make sure simulate_vibrations.py and compare_vibrations.py have run.</li>`;
        }
    }

    // Render Sidebar Directory
    function renderDirectory(data) {
        compoundList.innerHTML = '';
        if (data.length === 0) {
            compoundList.innerHTML = '<li class="empty-state">No matching aroma chemicals found</li>';
            return;
        }

        data.forEach(comp => {
            const li = document.createElement('li');
            li.className = 'compound-item';
            
            // Apply selected classes dynamically
            if (selectedMolA && selectedMolA.cas === comp.cas) {
                li.classList.add('selected-a');
            }
            if (selectedMolB && selectedMolB.cas === comp.cas) {
                li.classList.add('selected-b');
            }

            li.innerHTML = `
                <div class="comp-info">
                    <span class="comp-name" title="${comp.name}">${comp.name}</span>
                    <div class="comp-meta">
                        <span class="comp-cas">${comp.cas}</span>
                        <span class="comp-formula">${comp.formula}</span>
                    </div>
                </div>
                <div class="comp-actions">
                    <button class="action-btn-small a-btn" title="Set as Molecule A (Gold)">A</button>
                    <button class="action-btn-small b-btn" title="Set as Molecule B (Cyan)">B</button>
                </div>
            `;

            // Left text block selects Molecule A
            li.querySelector('.comp-info').addEventListener('click', (e) => {
                e.stopPropagation();
                selectMoleculeA(comp);
            });

            // A button selects Molecule A
            li.querySelector('.a-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectMoleculeA(comp);
            });

            // B button selects Molecule B
            li.querySelector('.b-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectMoleculeB(comp);
            });

            compoundList.appendChild(li);
        });
    }

    // Unified Search Logic (combines text search and dynamic peak resonance filter)
    function runScentSearch() {
        const query = searchInput.value.toLowerCase().trim();
        
        const filtered = compoundsData.filter(comp => {
            // 1. Text Search matching
            const matchesQuery = !query || 
                comp.name.toLowerCase().includes(query) ||
                comp.cas.toLowerCase().includes(query) ||
                comp.formula.toLowerCase().includes(query);
                
            if (!matchesQuery) return false;
            
            // 2. Peak Filter matching (intensity >= 0.20 at the frequency bin index)
            if (activePeakFilter) {
                const curve = comp.spectrum_curve;
                if (!curve || curve.length <= activePeakFilter.index) return false;
                
                const intensityAtPeak = curve[activePeakFilter.index];
                return intensityAtPeak >= 0.20; // 0.20 threshold captures substantial resonance
            }
            
            return true;
        });

        // Sort by peak intensity descending if a peak filter is active
        if (activePeakFilter) {
            filtered.sort((a, b) => {
                const intA = a.spectrum_curve ? (a.spectrum_curve[activePeakFilter.index] || 0) : 0;
                const intB = b.spectrum_curve ? (b.spectrum_curve[activePeakFilter.index] || 0) : 0;
                return intB - intA;
            });
        }
        
        renderDirectory(filtered);
        updateSearchSuggestions(query, filtered);
    }

    // Render Autocomplete Dropdown Suggestions (disabled to prevent overlapping lists since directory filters in real-time)
    function updateSearchSuggestions(query, filtered) {
        if (searchSuggestions) {
            searchSuggestions.innerHTML = '';
            searchSuggestions.classList.add('hidden');
        }
        return;
    }

    function clearSearchInputAndSuggestions() {
        searchInput.value = '';
        if (searchSuggestions) {
            searchSuggestions.innerHTML = '';
            searchSuggestions.classList.add('hidden');
        }
        runScentSearch();
    }

    searchInput.addEventListener('input', () => {
        runScentSearch();
    });

    searchInput.addEventListener('focus', () => {
        const query = searchInput.value.toLowerCase().trim();
        if (query) {
            runScentSearch();
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (searchSuggestions) {
                searchSuggestions.classList.add('hidden');
            }
        } else if (e.key === 'Enter') {
            const query = searchInput.value.toLowerCase().trim();
            if (query && searchSuggestions && !searchSuggestions.classList.contains('hidden')) {
                const firstItem = searchSuggestions.querySelector('.suggestion-item');
                if (firstItem) {
                    firstItem.click(); // Trigger select A
                }
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (searchSuggestions && !searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.classList.add('hidden');
        }
    });

    // Find local maxima (peaks) of a spectrum curve above a minimum intensity threshold
    function findPeaks(curve, grid) {
        const peaks = [];
        for (let i = 1; i < curve.length - 1; i++) {
            const val = curve[i];
            // A peak is a local maximum above a threshold of 0.05
            if (val > 0.05 && val > curve[i - 1] && val > curve[i + 1]) {
                peaks.push({
                    frequency: grid[i],
                    intensity: val,
                    index: i
                });
            }
        }
        return peaks;
    }

    // Dynamic Shared Peaks Calculation (finds matching peak centers between A and B)
    function updateSharedPeaks() {
        if (!selectedMolA || !selectedMolB) {
            sharedPeaksDisplay.classList.add('hidden');
            return;
        }

        const yA = selectedMolA.spectrum_curve;
        const yB = selectedMolB.spectrum_curve;
        const grid = selectedMolA.spectrum_grid;

        if (!yA || !yB || !grid || yA.length !== yB.length) {
            sharedPeaksDisplay.classList.add('hidden');
            return;
        }

        const peaksA = findPeaks(yA, grid);
        const peaksB = findPeaks(yB, grid);

        const sharedPeaks = [];
        const tolerance = 30; // cm^-1 tolerance for matching peak centers

        peaksA.forEach(pA => {
            // Find if there is an active peak in B close to the peak in A
            const match = peaksB.find(pB => Math.abs(pB.frequency - pA.frequency) <= tolerance);
            if (match) {
                sharedPeaks.push({
                    frequency: pA.frequency,
                    intensity: Math.min(pA.intensity, match.intensity),
                    index: pA.index
                });
            }
        });

        // Sort by intensity descending and keep top 6
        sharedPeaks.sort((a, b) => b.intensity - a.intensity);
        const topPeaks = sharedPeaks.slice(0, 6);

        // Sort back by frequency for natural reading order
        topPeaks.sort((a, b) => a.frequency - b.frequency);

        // Populate shared peaks list UI
        sharedPeaksList.innerHTML = '';
        if (topPeaks.length > 0) {
            topPeaks.forEach(p => {
                const btn = document.createElement('button');
                btn.className = 'peak-tag-btn';
                
                // Add friendly chemical group names to common IR bands
                let label = `${p.frequency} cm⁻¹`;
                if (p.frequency >= 1680 && p.frequency <= 1760) label += ' (Carbonyl C=O)';
                else if (p.frequency >= 3200 && p.frequency <= 3650) label += ' (Hydroxyl O-H)';
                else if (p.frequency >= 2850 && p.frequency <= 3000) label += ' (Alkyl C-H)';
                else if (p.frequency >= 1050 && p.frequency <= 1250) label += ' (Ether C-O)';
                else if (p.frequency >= 600 && p.frequency <= 750) label += ' (Sulfur C-S)';
                
                btn.textContent = label;
                btn.title = `Shared peak strength: ${p.intensity.toFixed(3)}`;
                
                btn.addEventListener('click', () => {
                    applyPeakFilter(p.frequency, p.index);
                });
                sharedPeaksList.appendChild(btn);
            });
        } else {
            const noSharedMsg = document.createElement('span');
            noSharedMsg.style.fontSize = '0.72rem';
            noSharedMsg.style.color = '#606060';
            noSharedMsg.style.fontStyle = 'italic';
            noSharedMsg.textContent = 'None (no significant shared resonance peaks)';
            sharedPeaksList.appendChild(noSharedMsg);
        }

        // Find vibrational gaps (peaks of difference where A is active but B is missing)
        const differenceCurve = yA.map((val, idx) => Math.max(0, val - yB[idx]));
        const gapPeaks = [];
        for (let i = 1; i < differenceCurve.length - 1; i++) {
            const val = differenceCurve[i];
            // Find local maxima of the difference above a significant gap threshold (0.10)
            if (val > 0.10 && val > differenceCurve[i - 1] && val > differenceCurve[i + 1]) {
                gapPeaks.push({
                    frequency: grid[i],
                    intensity: val,
                    index: i
                });
            }
        }

        // Sort by intensity descending (largest gaps first) and keep top 6
        gapPeaks.sort((a, b) => b.intensity - a.intensity);
        const topGaps = gapPeaks.slice(0, 6);
        // Sort by frequency for layout
        topGaps.sort((a, b) => a.frequency - b.frequency);

        // Populate gap list UI
        gapPeaksList.innerHTML = '';
        if (topGaps.length > 0) {
            topGaps.forEach(p => {
                const btn = document.createElement('button');
                btn.className = 'gap-tag-btn';
                
                let label = `${p.frequency} cm⁻¹`;
                if (p.frequency >= 1680 && p.frequency <= 1760) label += ' (Carbonyl C=O)';
                else if (p.frequency >= 3200 && p.frequency <= 3650) label += ' (Hydroxyl O-H)';
                else if (p.frequency >= 2850 && p.frequency <= 3000) label += ' (Alkyl C-H)';
                else if (p.frequency >= 1050 && p.frequency <= 1250) label += ' (Ether C-O)';
                else if (p.frequency >= 600 && p.frequency <= 750) label += ' (Sulfur C-S)';
                
                btn.textContent = label;
                btn.title = `Gap magnitude: ${p.intensity.toFixed(3)}`;
                
                btn.addEventListener('click', () => {
                    applyPeakFilter(p.frequency, p.index);
                });
                gapPeaksList.appendChild(btn);
            });
        } else {
            const noGapMsg = document.createElement('span');
            noGapMsg.style.fontSize = '0.72rem';
            noGapMsg.style.color = '#606060';
            noGapMsg.style.fontStyle = 'italic';
            noGapMsg.textContent = 'None (no significant vibrational gaps)';
            gapPeaksList.appendChild(noGapMsg);
        }

        sharedPeaksDisplay.classList.remove('hidden');
    }

    function applyPeakFilter(frequency, indexInGrid) {
        activePeakFilter = { frequency, index: indexInGrid };
        
        // Render filter active badge
        activeFiltersContainer.innerHTML = '';
        const badge = document.createElement('div');
        badge.className = 'filter-active-badge';
        badge.innerHTML = `⚡ Peak: ${frequency} cm⁻¹ <span style="margin-left: 6px; font-weight: bold;">✕</span>`;
        badge.title = "Click to clear filter";
        badge.addEventListener('click', () => {
            clearPeakFilter();
        });
        activeFiltersContainer.appendChild(badge);

        // Show detailed chemical and olfactory explanation card
        showPeakExplanation(frequency);

        // Filter the list
        runScentSearch();

        // Redraw chart to show vertical line annotation
        updateChart();
    }

    function clearPeakFilter() {
        activePeakFilter = null;
        activeFiltersContainer.innerHTML = '';
        
        // Hide explanation card
        hidePeakExplanation();

        // Reset list
        runScentSearch();

        // Redraw chart to remove vertical line annotation
        updateChart();
    }



    // Helper function to map frequency to its chemical/olfactory explanation
    function getPeakExplanation(freq) {
        if (freq >= 3200 && freq <= 3650) {
            return {
                title: "Hydroxyl (O-H) Single Bond Stretch",
                chemDesc: "High-frequency stretching vibration of the highly polar Oxygen-Hydrogen single bond. In liquid or condensed phases, intermolecular hydrogen bonding shifts and broadens this peak significantly. It has a very high infrared absorption intensity due to the large dynamic dipole moment change during vibration.",
                olfDesc: "A primary chemical marker for aromatic alcohols (e.g., Linalool, Phenethyl Alcohol, Menthol, Terpineol, Cinnamic Alcohol, Geraniol). Olfactory receptors translate this vibration as clean, botanical, fresh-airy, rose-like, or minty-cooling notes."
            };
        } else if (freq > 3000 && freq <= 3150) {
            return {
                title: "Aromatic (C-H) Carbon-Hydrogen Stretch",
                chemDesc: "Stretching vibration of hydrogen atoms bonded to sp² hybridized carbon atoms in an aromatic benzene ring. Because of the stronger s-character of the sp² carbon bond compared to sp³ aliphatic carbons, this vibration occurs at higher energy (above 3000 cm⁻¹).",
                olfDesc: "Standard signature of benzene ring derivatives (e.g., Benzaldehyde, Benzyl Acetate, Benzyl Salicylate, Anisaldehyde). It is heavily associated with sweet almond, cherry-like, warm honey, balsamic, or heavy night-blooming floral notes."
            };
        } else if (freq >= 2840 && freq <= 3000) {
            return {
                title: "Aliphatic Alkyl (C-H) Stretch",
                chemDesc: "Represents symmetric and asymmetric stretching vibrations of carbon-hydrogen single bonds in saturated carbon chains (alkanes, sp³ hybridized carbons). This is a nearly universal signature of organic compounds and appears as a strong, sharp cluster.",
                olfDesc: "Found in almost all organic aroma chemicals. Because it represents the basic molecular skeleton, human receptors often filter this vibration as baseline background noise, unless paired with specific polar functional groups. Represents the waxy-oily body of long-chain compounds."
            };
        } else if (freq >= 2700 && freq < 2840) {
            return {
                title: "Aldehydic Carbon-Hydrogen (C-H) Stretch",
                chemDesc: "A highly specific double-peak resonance (Fermi doublet) representing the carbon-hydrogen stretch of an aldehyde functional group, where the hydrogen is attached directly to the carbonyl carbon. The Fermi resonance splits the stretch into two bands around 2720 and 2820 cm⁻¹.",
                olfDesc: "Diagnostic signature of classic fatty aldehydes (e.g., Decanal, Octanal, Lauric Aldehyde, Cinnamaldehyde, Vanillin). Triggers a powerful, piercing, and diffusive sensory response characterized by waxy-citrus, sharp soapy, sweet vanilla, or hot cinnamon scents."
            };
        } else if (freq >= 2200 && freq <= 2400) {
            return {
                title: "Nitrile (C≡N) Triple Bond Stretch",
                chemDesc: "Stretching vibration of the carbon-nitrogen triple bond. This is a very strong, sharp band appearing in an otherwise empty region of the IR spectrum. The highly electronegative nitrogen creates a massive dipole moment, making this mode highly active.",
                olfDesc: "Characteristic of nitrile-based aroma chemicals used in modern perfumery as stable, non-discoloring alternatives to aldehydes (e.g., Lemonile, Peonile, Citronellonitrile). Receptors interpret this vibration as extremely sharp, metallic, green-citrusy, or peony-floral."
            };
        } else if (freq >= 1725 && freq <= 1760) {
            return {
                title: "Ester Carbonyl (C=O) Double Bond Stretch",
                chemDesc: "One of the most intense and diagnostic resonances in organic chemistry. The high electronegativity of the ester oxygen shifts the Carbon-Oxygen carbonyl double bond stretch to slightly higher frequencies than ketones. The huge dipole moment yield high tunneling cross-sections.",
                olfDesc: "Universal signature of fruity esters (e.g., Isoamyl Acetate, Benzyl Acetate, Ethyl Butyrate, Linalyl Acetate). Human receptors interpret this vibration as sweet, fruity (banana, pineapple, apple, pear), or sweet-floral (jasmine-like)."
            };
        } else if (freq >= 1660 && freq < 1725) {
            return {
                title: "Ketone / Aldehyde Carbonyl (C=O) Stretch",
                chemDesc: "High-intensity double bond stretching vibration of a carbonyl group in ketones or aldehydes. These bonds are slightly less polar than ester carbonyls, shifting the peak to slightly lower wavenumbers (1680 - 1715 cm⁻¹). Resonance with double bonds (conjugation) lowers the frequency further.",
                olfDesc: "Key marker for ketones and cyclic ketones (e.g., Carvone, Methyl Pamplemousse, Coumarin, Ionone). Olfactory receptors map this to warm, minty (spearmint), herbal, sweet-hay (coumarinic), or violet-like and woody characters."
            };
        } else if (freq >= 1600 && freq < 1660) {
            return {
                title: "Alkenyl Olefinic (C=C) Double Bond Stretch",
                chemDesc: "Stretching vibration of carbon-carbon double bonds. If the double bond is symmetric, this peak can be weak in IR, but it is highly active in Raman spectroscopy. Conjugation with other double bonds or aromatic rings enhances its IR intensity.",
                olfDesc: "Marker for unsaturated terpenes and alkenes (e.g., Limonene, Myrcene, Terpineol, Citral). Receptors perceive this double bond vibration as contributing a sharp, sparkling, citrusy-green, or terpene-like top note freshness."
            };
        } else if (freq >= 1450 && freq < 1600) {
            return {
                title: "Aromatic Ring (C=C) Skeletal Stretch",
                chemDesc: "Corresponds to the stretching of carbon-carbon bonds within an aromatic ring system. These modes are sharp and diagnostic of benzene aromaticity, representing collective, delocalized electron resonance within the ring structure.",
                olfDesc: "Crucial for heavy floral, balsamic, and spicy base notes (e.g., Eugenol, Benzyl Salicylate, Cinnamic Alcohol, Anisaldehyde). Helps olfactory receptors recognize structural aromaticity, translating it into warm, balsamic, clove-like, or almond-floral scents."
            };
        } else if (freq >= 1350 && freq < 1450) {
            return {
                title: "Alkyl (C-H) Bending (Deformation)",
                chemDesc: "Represents the in-plane bending (scissoring or rocking) of C-H single bonds in methyl (CH₃) and methylene (CH₂) groups. Requires less energy than stretching, so it appears at lower wavenumbers. Gem-dimethyl groups show a characteristic split doublet.",
                olfDesc: "Indicates carbon branching and saturation levels (e.g., isopropyl and methyl branches in Citral, Linalool, or Terpineol). These skeletal vibrations dictate the physical width and fit of the molecule in G-protein G-coupled receptors."
            };
        } else if (freq >= 1200 && freq < 1300) {
            return {
                title: "Ester Asymmetric (C-O-C) Stretch",
                chemDesc: "Strong asymmetric stretching vibration of the carbon-oxygen single bonds in esters. The highly polar C-O single bond produces a very intense, broad band in this region of the fingerprint spectrum.",
                olfDesc: "Characteristic of acetate and butyrate esters (e.g., Isoamyl Acetate, Hexyl Acetate, Benzyl Acetate). Receptors interpret this single bond stretch as contributing to the diffusive, volatile, fruity-sweetness of top and heart notes."
            };
        } else if (freq >= 1050 && freq < 1200) {
            return {
                title: "Ether / Cyclic Ether (C-O-C) Stretch",
                chemDesc: "Stretching vibration of carbon-oxygen-carbon single bonds in aliphatic ethers or cyclic ethers. The polar nature of the ether oxygen creates a strong, distinct fingerprint absorption band.",
                olfDesc: "Diagnostic marker for cyclic ethers and amber-woody materials (e.g., Eucalyptol/Cineole, Ambroxan, Ambrocenide). Olfactory receptors map this ether stretch to highly diffusive, cooling camphoraceous, medicinal, or rich amber-woody, dry-woody, and animalic base notes."
            };
        } else if (freq >= 900 && freq < 1050) {
            return {
                title: "Skeletal C-C Stretch & Alkene Out-of-Plane Bending",
                chemDesc: "Stretching of the carbon-carbon single bond skeleton coupled with out-of-plane bending vibrations of double-bonded hydrogen atoms (trans, cis, or vinyl alkenes). Highly diagnostic of double bond substitution geometry.",
                olfDesc: "Found in cyclic terpenes and sesquiterpenes (e.g., Limonene, Caryophyllene, Pinene). Defines the rigid 3D shape of the molecule. Receptors read these configurations to differentiate woody, piney, and herbal nuances."
            };
        } else if (freq >= 700 && freq < 900) {
            return {
                title: "Aromatic Out-of-Plane C-H Bending",
                chemDesc: "Out-of-plane bending vibrations of hydrogen atoms attached directly to an aromatic benzene ring. These bands are extremely strong and diagnostic of the substitution pattern of the benzene ring (mono, ortho, meta, para).",
                olfDesc: "Present in balsamic and sweet-floral aromatics (e.g., Methyl Benzoate, Benzyl Alcohol, Anisaldehyde, Eugenol). Heavily linked to sweet-floral (ylang-ylang, jasmine), heavy balsamic, or wintergreen-like aromatic characters."
            };
        } else if (freq >= 600 && freq < 700) {
            return {
                title: "Organosulfur (C-S) Stretch",
                chemDesc: "Low-frequency stretching vibration of the carbon-sulfur bond. Due to the heavy sulfur atom, the bond has a lower spring constant, causing it to oscillate at much lower energy. Highly active in the lower fingerprint region.",
                olfDesc: "A crucial signature of sulfurous compounds (e.g., Dimethyl Sulfide, Furfuryl Mercaptan, Ribes Mercaptan). The human olfactory system is highly sensitized to these low-frequency sulfur vibrations, interpreting them as roasted coffee, garlic, onion, or blackcurrant notes at extreme dilutions."
            };
        } else {
            return {
                title: "Skeletal Fingerprint & Deformation Mode",
                chemDesc: "Corresponds to complex, long-range torsional bending, skeletal deformations, and ring-puckering of the carbon backbone. These modes are highly sensitive to the overall shape, conformation, and stereochemical isomer configuration of the molecule.",
                olfDesc: "Acts as a unique structural signature. In the lock-and-key and vibration hybrid theories, these skeletal modes define the exact spatial vibration pattern that tells the brain how to differentiate close isomers."
            };
        }
    }

    // Display the Active Peak Explanation Card
    function showPeakExplanation(frequency) {
        const card = document.getElementById('peak-active-explanation-card');
        if (!card) return;

        const info = getPeakExplanation(frequency);
        const freqNum = Number(frequency);
        
        document.getElementById('peak-active-wavenumber').textContent = frequency;
        document.getElementById('peak-active-title').textContent = info.title;
        document.getElementById('peak-active-chem-desc').textContent = info.chemDesc;
        document.getElementById('peak-active-olf-desc').textContent = info.olfDesc;
        
        // Populate the physical metrics grid with dynamic calculated values
        if (freqNum > 0) {
            const wavelength = (10000 / freqNum).toFixed(3); // micrometers (µm)
            const energy = (freqNum * 0.12398).toFixed(1);  // milli-electronvolts (meV)
            const period = (33356.4 / freqNum).toFixed(1);  // oscillation period in femtoseconds (fs)
            
            document.getElementById('peak-metric-wavelength').textContent = `${wavelength} µm`;
            document.getElementById('peak-metric-energy').textContent = `${energy} meV`;
            document.getElementById('peak-metric-period').textContent = `${period} fs`;
        } else {
            document.getElementById('peak-metric-wavelength').textContent = `-`;
            document.getElementById('peak-metric-energy').textContent = `-`;
            document.getElementById('peak-metric-period').textContent = `-`;
        }
        
        card.classList.remove('hidden');
    }

    // Hide the Active Peak Explanation Card
    function hidePeakExplanation() {
        const card = document.getElementById('peak-active-explanation-card');
        if (card) {
            card.classList.add('hidden');
        }
    }

    // Highlight items in the sidebar list based on A/B selection states
    function updateListHighlightStates() {
        document.querySelectorAll('.compound-item').forEach(el => {
            const casSpan = el.querySelector('.comp-cas');
            if (casSpan) {
                const cas = casSpan.textContent.trim();
                
                // Molecule A highlight
                if (selectedMolA && selectedMolA.cas === cas) {
                    el.classList.add('selected-a');
                    el.classList.remove('selected-b'); // Cannot be both at same time in active visualization
                } else {
                    el.classList.remove('selected-a');
                }
                
                // Molecule B highlight
                if (selectedMolB && selectedMolB.cas === cas) {
                    el.classList.add('selected-b');
                    el.classList.remove('selected-a');
                } else {
                    el.classList.remove('selected-b');
                }
            }
        });
    }

    // Load active Molecule A
    function selectMoleculeA(comp) {
        selectedMolA = comp;
        
        // Render Meta Information
        molAName.textContent = comp.name;
        molACas.textContent = comp.cas;
        molAFormula.textContent = comp.formula;
        molAWeight.textContent = `${comp.weight.toFixed(2)} g/mol`;
        molACid.innerHTML = `<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${comp.cid}" target="_blank" class="val-mono" style="color: var(--gold); text-decoration: none; border-bottom: 1px dotted;">${comp.cid} 🔗</a>`;
        molAPrice.textContent = comp.price_thb_g > 0 ? `${comp.price_thb_g.toFixed(2)} THB/g` : "Not available";

        // Render Normal Mode Frequency Chips
        modesListContainer.innerHTML = '';
        if (comp.vibrational_frequencies && comp.vibrational_frequencies.length > 0) {
            comp.vibrational_frequencies.forEach(f => {
                const chip = document.createElement('span');
                chip.className = 'mode-chip';
                chip.style.cursor = 'pointer';
                chip.title = "Click to filter compounds by this vibration frequency";
                chip.textContent = `${f.toFixed(1)}`;
                
                chip.addEventListener('click', () => {
                    const gridFreq = Math.round(f / 10) * 10;
                    const gridIndex = Math.round((gridFreq - 400) / 10);
                    if (gridIndex >= 0 && comp.spectrum_grid && gridIndex < comp.spectrum_grid.length) {
                        applyPeakFilter(gridFreq, gridIndex);
                    } else {
                        const approxIdx = Math.max(0, Math.min(360, Math.round((f - 400) / 10)));
                        applyPeakFilter(Math.round(f / 10) * 10, approxIdx);
                    }
                });
                modesListContainer.appendChild(chip);
            });
        } else {
            modesListContainer.innerHTML = '<p class="empty-state">No frequencies calculated.</p>';
        }

        // Render Similarity Hub Lists
        renderSimilarityHub(comp.cas);

        // If Molecule B is selected, update comparison calculations
        if (selectedMolB) {
            calculateAndDisplayOverlap();
            updateSharedPeaks();
            calculateScentBridge();
        } else {
            hideScentBridge();
        }

        // Update Plots
        updateChart();
        drawLissajous();

        // Highlight list items
        updateListHighlightStates();
    }

    // Set active Molecule B comparison selection
    function selectMoleculeB(comp) {
        // Prevent setting A and B to the exact same molecule
        if (selectedMolA && selectedMolA.cas === comp.cas) {
            alert("Molecule B cannot be the same as Molecule A.");
            return;
        }
        selectedMolB = comp;
        
        // Update UI displays in Molecule B details card
        molBName.textContent = comp.name;
        molBCas.textContent = comp.cas;
        molBFormula.textContent = comp.formula;
        molBWeight.textContent = `${comp.weight.toFixed(2)} g/mol`;
        molBCid.innerHTML = `<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${comp.cid}" target="_blank" class="val-mono" style="color: var(--cyan); text-decoration: none; border-bottom: 1px dotted;">${comp.cid} 🔗</a>`;
        molBPrice.textContent = comp.price_thb_g > 0 ? `${comp.price_thb_g.toFixed(2)} THB/g` : "Not available";

        if (clearBBtn) {
            clearBBtn.classList.remove('hidden');
        }
        
        const legB = document.getElementById('legend-b');
        if (legB) {
            legB.textContent = `Molecule B: ${comp.name}`;
            legB.classList.remove('hidden');
        }
        
        legendB.classList.remove('hidden');
        legendDelta.classList.remove('hidden');
        
        // Update overlap gauge and shared peaks
        calculateAndDisplayOverlap();
        updateSharedPeaks();
        calculateScentBridge();
        
        // Update plots
        updateChart();
        drawLissajous();
        
        // Highlight list items
        updateListHighlightStates();
    }

    // Remove active Molecule B selection
    function clearMoleculeB() {
        selectedMolB = null;
        
        // Reset Molecule B card details
        molBName.textContent = 'None (Select from list)';
        molBCas.textContent = '-';
        molBFormula.textContent = '-';
        molBWeight.textContent = '-';
        molBCid.textContent = '-';
        molBPrice.textContent = '-';

        if (clearBBtn) {
            clearBBtn.classList.add('hidden');
        }
        
        legendB.classList.add('hidden');
        legendDelta.classList.add('hidden');
        
        resetOverlapGauge();
        sharedPeaksDisplay.classList.add('hidden');
        hideScentBridge();
        
        // Update plots
        updateChart();
        drawLissajous();
        
        // Highlight list items
        updateListHighlightStates();
    }

    // Render Similarity Hub (Closest / Farthest Lists)
    function renderSimilarityHub(cas) {
        closestList.innerHTML = '';
        farthestList.innerHTML = '';
        
        const report = similarityData[cas];
        if (!report) {
            closestList.innerHTML = '<li class="empty-state">No report available</li>';
            farthestList.innerHTML = '<li class="empty-state">No report available</li>';
            return;
        }

        const limit = similarityLimitSelect ? parseInt(similarityLimitSelect.value) || 10 : 10;

        // Render Closest list
        const closestItems = report.closest.slice(0, limit);
        closestItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'match-item';
            const scoreClass = item.similarity > 0.7 ? 'score-high' : '';
            li.innerHTML = `
                <span class="match-name" title="${item.name}">${item.name}</span>
                <span class="match-score ${scoreClass}">${(item.similarity * 100).toFixed(1)}%</span>
            `;
            li.addEventListener('click', () => {
                const compB = compoundsData.find(c => c.cas === item.cas);
                if (compB) {
                    selectMoleculeB(compB);
                }
            });
            closestList.appendChild(li);
        });

        // Render Farthest list
        const farthestItems = report.farthest.slice(0, limit);
        farthestItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'match-item';
            const scoreClass = item.similarity < 0.2 ? 'score-low' : '';
            li.innerHTML = `
                <span class="match-name" title="${item.name}">${item.name}</span>
                <span class="match-score ${scoreClass}">${(item.similarity * 100).toFixed(1)}%</span>
            `;
            li.addEventListener('click', () => {
                const compB = compoundsData.find(c => c.cas === item.cas);
                if (compB) {
                    selectMoleculeB(compB);
                }
            });
            farthestList.appendChild(li);
        });
    }

    // Dynamic Spectral Overlap Calculation (Weighted Cosine Similarity of continuous curves)
    function calculateAndDisplayOverlap() {
        if (!selectedMolA || !selectedMolB) return;

        const yA = selectedMolA.spectrum_curve;
        const yB = selectedMolB.spectrum_curve;

        if (!yA || !yB || yA.length !== yB.length || globalWeights.length !== yA.length) {
            resetOverlapGauge();
            return;
        }

        // Vector dot product with weights applied
        let dotProduct = 0;
        let normASq = 0;
        let normBSq = 0;
        for (let i = 0; i < yA.length; i++) {
            const w = globalWeights[i];
            const valA = yA[i] * w;
            const valB = yB[i] * w;
            dotProduct += valA * valB;
            normASq += valA * valA;
            normBSq += valB * valB;
        }

        const normA = Math.sqrt(normASq);
        const normB = Math.sqrt(normBSq);
        
        let overlap = 0.0;
        if (normA > 0 && normB > 0) {
            overlap = dotProduct / (normA * normB);
        }

        // Clamp overlap value between 0.0 and 1.0 to prevent numeric overflow/artifacts
        overlap = Math.max(0.0, Math.min(1.0, overlap));
        const percentage = Math.round(overlap * 100);

        // Animate circular SVG gauge
        overlapCircle.style.strokeDasharray = `${percentage}, 100`;
        overlapText.textContent = `${percentage}%`;

        // Update Overlap Description Text
        let comment = "";
        if (percentage >= 85) {
            comment = "Nearly identical vibrations! Very strong candidate for olfactory substitution.";
            overlapCircle.style.stroke = "#39e09b"; // Green for highly similar
        } else if (percentage >= 60) {
            comment = "Strong vibrational overlap. Likely shares significant aroma characteristics.";
            overlapCircle.style.stroke = "var(--gold)";
        } else if (percentage >= 35) {
            comment = "Moderate overlap. May share some structural/functional group similarities.";
            overlapCircle.style.stroke = "var(--gold-dim)";
        } else {
            comment = "Completely different vibrational profiles. Distinct olfactory behaviors.";
            overlapCircle.style.stroke = "#ff5b5b"; // Red for different
        }
        overlapDesc.innerHTML = `<strong>${selectedMolB.name}</strong><br>${comment}`;
    }

    function resetOverlapGauge() {
        overlapCircle.style.strokeDasharray = `0, 100`;
        overlapCircle.style.stroke = "var(--gold)";
        overlapText.textContent = `0%`;
        overlapDesc.textContent = "Select Molecule B to calculate similarity";
    }

    function calculateScentBridge() {
        const bridgeCard = document.getElementById('bridge-finder-card');
        const bridgeList = document.getElementById('bridge-list');
        
        if (!selectedMolA || !selectedMolB || !bridgeCard || !bridgeList) {
            hideScentBridge();
            return;
        }

        const xA = selectedMolA.x;
        const yA = selectedMolA.y;
        const xB = selectedMolB.x;
        const yB = selectedMolB.y;

        // Verify that A and B have valid coordinates
        if (xA === undefined || yA === undefined || xB === undefined || yB === undefined) {
            hideScentBridge();
            return;
        }

        // Calculate line segment vector from A to B
        const vx = xB - xA;
        const vy = yB - yA;
        const lenSq = vx * vx + vy * vy;

        if (lenSq === 0) {
            hideScentBridge();
            return;
        }

        const bridgeCandidates = [];
        const maxDist = 120.0; // Distance threshold in spatial coordinates

        compoundsData.forEach(comp => {
            // Exclude Molecule A and Molecule B
            if (comp.cas === selectedMolA.cas || comp.cas === selectedMolB.cas) return;
            if (comp.x === undefined || comp.y === undefined) return;

            const cx = comp.x;
            const cy = comp.y;

            // Projection factor t
            const t = ((cx - xA) * vx + (cy - yA) * vy) / lenSq;

            // Only keep compounds that are physically between A and B
            if (t > 0.0 && t < 1.0) {
                // Project coordinate
                const projX = xA + t * vx;
                const projY = yA + t * vy;

                // Perpendicular distance d
                const d = Math.sqrt((cx - projX) * (cx - projX) + (cy - projY) * (cy - projY));

                if (d <= maxDist) {
                    bridgeCandidates.push({
                        compound: comp,
                        t: t,
                        d: d
                    });
                }
            }
        });

        // Sort candidates by t ascending (from A to B)
        bridgeCandidates.sort((a, b) => a.t - b.t);

        // Render Bridge UI
        bridgeList.innerHTML = '';
        if (bridgeCandidates.length === 0) {
            bridgeList.innerHTML = '<div style="color: var(--text-secondary); padding: 12px; font-size: 0.9rem;">No bridging aroma chemicals found close to this transition path. Try selecting different molecules.</div>';
        } else {
            bridgeCandidates.forEach((cand, idx) => {
                const comp = cand.compound;
                
                // Create compact bridge pill step
                const step = document.createElement('div');
                step.className = 'bridge-step';
                step.title = `${comp.name}\nCAS: ${comp.cas}\nOffset: ${Math.round(cand.d)}px`;

                const prog = document.createElement('span');
                prog.className = 'step-progress';
                prog.textContent = `${Math.round(cand.t * 100)}%`;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'step-name';
                nameSpan.textContent = comp.name;

                const btnGroup = document.createElement('div');
                btnGroup.className = 'step-actions';

                const btnA = document.createElement('button');
                btnA.className = 'step-btn a-btn';
                btnA.textContent = 'A';
                btnA.title = 'Set as Molecule A';
                btnA.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectMoleculeA(comp);
                });

                const btnB = document.createElement('button');
                btnB.className = 'step-btn b-btn';
                btnB.textContent = 'B';
                btnB.title = 'Set as Molecule B';
                btnB.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectMoleculeB(comp);
                });

                btnGroup.appendChild(btnA);
                btnGroup.appendChild(btnB);
                
                step.appendChild(prog);
                step.appendChild(nameSpan);
                step.appendChild(btnGroup);

                // Allow step click to trigger main inspection
                step.style.cursor = 'pointer';
                step.addEventListener('click', () => {
                    selectMoleculeA(comp);
                });

                bridgeList.appendChild(step);

                // Add connecting arrow between steps (except the last one)
                if (idx < bridgeCandidates.length - 1) {
                    const arrow = document.createElement('span');
                    arrow.className = 'bridge-arrow';
                    arrow.textContent = '→';
                    bridgeList.appendChild(arrow);
                }
            });
        }

        // Show the panel
        bridgeCard.classList.remove('hidden');
    }

    function hideScentBridge() {
        const bridgeCard = document.getElementById('bridge-finder-card');
        if (bridgeCard) {
            bridgeCard.classList.add('hidden');
        }
    }

    // Redraw spectrum curves in Chart.js
    function updateChart() {
        if (!spectrumChart || !selectedMolA) return;

        const grid = selectedMolA.spectrum_grid;
        const curveA = selectedMolA.spectrum_curve;

        spectrumChart.data.labels = grid;
        
        // Dataset A: Molecule A
        const datasets = [{
            label: selectedMolA.name,
            data: curveA,
            borderColor: '#d4af37', // Gold line
            backgroundColor: 'rgba(212, 175, 55, 0.12)', // Subtle gold fill
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.25
        }];

        // Dataset B: Molecule B (if selected)
        if (selectedMolB) {
            const curveB = selectedMolB.spectrum_curve;
            datasets.push({
                label: selectedMolB.name,
                data: curveB,
                borderColor: '#00f2fe', // Cyan line
                backgroundColor: 'rgba(0, 242, 254, 0.08)', // Subtle cyan fill
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                tension: 0.25
            });

            // Dataset C: Delta (A - B)
            const deltaCurve = curveA.map((val, idx) => val - curveB[idx]);
            datasets.push({
                label: 'Vibrational Delta',
                data: deltaCurve,
                borderColor: '#ff9f1c', // Orange dashed line
                backgroundColor: 'rgba(255, 159, 28, 0.06)', // Very faint orange fill
                fill: 'origin',
                borderWidth: 1.5,
                borderDash: [4, 4],
                pointRadius: 0,
                pointHoverRadius: 5,
                tension: 0.25
            });
        }

        spectrumChart.data.datasets = datasets;
        spectrumChart.update();
    }

    // Lissajous Phase Space Visualizer
    function drawLissajous() {
        const canvas = document.getElementById('lissajousCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = '#090909';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let i = 20; i < width; i += 20) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }

        if (!selectedMolA) {
            ctx.fillStyle = '#606060';
            ctx.font = '10px Share Tech Mono';
            ctx.textAlign = 'center';
            ctx.fillText('Select Mol A', width / 2, height / 2);
            return;
        }

        const yA = selectedMolA.spectrum_curve;
        // Fallback to self-resonance if no Molecule B
        const yB = selectedMolB ? selectedMolB.spectrum_curve : yA;

        if (!yA || !yB || yA.length !== yB.length) return;

        // Find max value in curves to auto-scale nicely
        let maxVal = 0.1;
        for (let i = 0; i < yA.length; i++) {
            if (yA[i] > maxVal) maxVal = yA[i];
            if (yB[i] > maxVal) maxVal = yB[i];
        }
        maxVal *= 1.1; // Add margin

        const margin = 10;
        const scaleX = (width - 2 * margin) / maxVal;
        const scaleY = (height - 2 * margin) / maxVal;

        // Draw the parametric curve
        ctx.beginPath();
        for (let i = 0; i < yA.length; i++) {
            const px = margin + yA[i] * scaleX;
            const py = height - margin - yB[i] * scaleY; // flip y for canvas coords

            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }

        // Set styling: glowing lines!
        ctx.strokeStyle = selectedMolB ? 'rgba(212, 175, 55, 0.85)' : 'rgba(212, 175, 55, 0.3)';
        ctx.lineWidth = selectedMolB ? 2.5 : 1.5;
        ctx.shadowBlur = selectedMolB ? 8 : 2;
        ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        // Add visual descriptive labels for self-resonance vs comparative
        const descEl = document.getElementById('lissajous-desc');
        if (descEl) {
            if (selectedMolB) {
                const alignment = Math.abs(yA.reduce((sum, v, idx) => sum + Math.abs(v - yB[idx]), 0));
                if (alignment < 5.0) {
                    descEl.innerHTML = `<strong>In Phase:</strong> Nearly perfect diagonal symmetry. Highly resonant.`;
                } else {
                    descEl.innerHTML = `<strong>Complex Phase:</strong> Distinct loops represent offset vibrational peaks.`;
                }
            } else {
                descEl.innerHTML = `<strong>Self Resonance:</strong> Identity diagonal showing Molecule A's ground state.`;
            }
        }

        // Draw tiny indicator points at key organic stretch regions
        // Carbonyl (C=O) ~ 1700 cm^-1 (index 130 in grid 400-4000 step 10)
        // C-H stretch ~ 2900 cm^-1 (index 250 in grid)
        const markers = [
            { name: 'C=O', index: 130, color: '#ff9f1c' },
            { name: 'C-H', index: 250, color: '#00f2fe' }
        ];

        markers.forEach(m => {
            if (m.index < yA.length) {
                const px = margin + yA[m.index] * scaleX;
                const py = height - margin - yB[m.index] * scaleY;
                if (yA[m.index] > 0.05 || yB[m.index] > 0.05) {
                    ctx.beginPath();
                    ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
                    ctx.fillStyle = m.color;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = m.color;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }
        });
    }

    // Vis.js Node Graph Setup
    function initNetworkGraph() {
        const loader = document.getElementById('network-loading');
        if (loader) {
            loader.style.opacity = '1';
            loader.classList.remove('hidden');
        }
        
        // Pause slightly to let loading spinner render
        setTimeout(() => {
            renderVisNetwork();
        }, 100);
    }

    function renderVisNetwork() {
        if (compoundsData.length === 0) return;
        
        const container = document.getElementById('network-canvas');
        const nodes = [];
        const edges = [];
        const nodesLookup = {};
        
        // Assemble nodes (deduplicated by CAS to prevent Vis.js duplicate ID crash)
        const seenCas = new Set();
        compoundsData.forEach(comp => {
            if (seenCas.has(comp.cas)) return;
            seenCas.add(comp.cas);
            let nodeColor = {
                background: '#1a1a1a',
                border: '#333333',
                highlight: {
                    background: '#2d2508',
                    border: 'var(--gold)'
                }
            };
            
            // Highlight current active node in gold
            if (selectedMolA && comp.cas === selectedMolA.cas) {
                nodeColor = {
                    background: '#3d320a',
                    border: 'var(--gold)',
                    highlight: {
                        background: '#3d320a',
                        border: 'var(--gold)'
                    }
                };
            } else if (selectedMolA && selectedMolB && comp.cas === selectedMolB.cas) {
                // Highlight Molecule B in cyan
                nodeColor = {
                    background: '#0a363d',
                    border: 'var(--cyan)',
                    highlight: {
                        background: '#0a363d',
                        border: 'var(--cyan)'
                    }
                };
            } else if (selectedMolA && selectedMolB) {
                // Check if this node lies on the bridge between A and B
                const xA = selectedMolA.x;
                const yA = selectedMolA.y;
                const xB = selectedMolB.x;
                const yB = selectedMolB.y;
                
                let onBridge = false;
                if (xA !== undefined && yA !== undefined && xB !== undefined && yB !== undefined && comp.x !== undefined && comp.y !== undefined) {
                    const vx = xB - xA;
                    const vy = yB - yA;
                    const lenSq = vx * vx + vy * vy;
                    if (lenSq > 0) {
                        const t = ((comp.x - xA) * vx + (comp.y - yA) * vy) / lenSq;
                        if (t > 0.0 && t < 1.0) {
                            const projX = xA + t * vx;
                            const projY = yA + t * vy;
                            const d = Math.sqrt((comp.x - projX) * (comp.x - projX) + (comp.y - projY) * (comp.y - projY));
                            if (d <= 120.0) {
                                onBridge = true;
                            }
                        }
                    }
                }
                
                if (onBridge) {
                    nodeColor = {
                        background: '#3d280a', // Dark warm gold/orange
                        border: '#ff9f1c',     // Glowing orange
                        highlight: { background: '#4d320c', border: '#ff9f1c' }
                    };
                } else {
                    // Regular similarity highlights
                    const report = similarityData[selectedMolA.cas];
                    if (report) {
                        const match = report.closest.find(m => m.cas === comp.cas);
                        if (match) {
                            if (match.similarity >= 0.8) {
                                nodeColor = {
                                    background: '#0b2416',
                                    border: '#39e09b',
                                    highlight: { background: '#0f361f', border: '#39e09b' }
                                };
                            } else if (match.similarity >= 0.6) {
                                nodeColor = {
                                    background: '#061c24',
                                    border: 'var(--cyan)',
                                    highlight: { background: '#0a2a36', border: 'var(--cyan)' }
                                };
                            }
                        }
                    }
                }
            } else if (selectedMolA) {
                // Style matches relative to selectedMolA
                const report = similarityData[selectedMolA.cas];
                if (report) {
                    const match = report.closest.find(m => m.cas === comp.cas);
                    if (match) {
                        if (match.similarity >= 0.8) {
                            nodeColor = {
                                background: '#0b2416', // Deep green
                                border: '#39e09b',     // Bright green
                                highlight: { background: '#0f361f', border: '#39e09b' }
                            };
                        } else if (match.similarity >= 0.6) {
                            nodeColor = {
                                background: '#061c24', // Deep cyan
                                border: 'var(--cyan)',  // Bright cyan
                                highlight: { background: '#0a2a36', border: 'var(--cyan)' }
                            };
                        }
                    }
                }
            }

            nodes.push({
                id: comp.cas,
                label: comp.name.length > 14 ? comp.name.substring(0, 12) + '..' : comp.name,
                title: `${comp.name}\nCAS: ${comp.cas}\nFormula: ${comp.formula}\nFrequencies: ${comp.vibrational_frequencies.length} modes`,
                x: comp.x || 0.0,
                y: comp.y || 0.0,
                color: nodeColor,
                font: { color: '#e0e0e0', face: 'Inter', size: 10 }
            });
            nodesLookup[comp.cas] = comp;
        });

        // Assemble edges based on threshold
        const addedEdges = new Set();
        const keys = Object.keys(similarityData);

        keys.forEach(casA => {
            const report = similarityData[casA];
            if (!report) return;
            
            report.closest.forEach(match => {
                if (match.similarity >= currentThreshold) {
                    // Check if both nodes exist in nodesLookup before creating edge to avoid Vis.js fatal crash
                    if (!nodesLookup[casA] || !nodesLookup[match.cas]) return;

                    const edgeKey = [casA, match.cas].sort().join('-');
                    if (!addedEdges.has(edgeKey)) {
                        addedEdges.add(edgeKey);
                        
                        // Map similarity value above threshold to line thickness
                        const thickness = 1.0 + (match.similarity - currentThreshold) * 10;
                        edges.push({
                            from: casA,
                            to: match.cas,
                            width: Math.min(thickness, 4.0),
                            color: {
                                color: 'rgba(212, 175, 55, 0.12)',
                                highlight: 'rgba(212, 175, 55, 0.4)'
                            },
                            smooth: { type: 'continuous' }
                        });
                    }
                }
            });
        });

        netStatNodes.textContent = nodes.length;
        netStatEdges.textContent = edges.length;

        // Fallback to standard javascript arrays if vis.DataSet is not defined in the library bundle
        const graphData = {
            nodes: (typeof vis.DataSet !== 'undefined') ? new vis.DataSet(nodes) : nodes,
            edges: (typeof vis.DataSet !== 'undefined') ? new vis.DataSet(edges) : edges
        };

        const graphOptions = {
            physics: {
                enabled: false
            },
            interaction: {
                hover: true,
                tooltipDelay: 250,
                zoomView: true,
                dragView: true
            },
            nodes: {
                shape: 'dot',
                size: 7,
                borderWidth: 1.5,
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.6)',
                    size: 4
                }
            }
        };

        if (networkInstance) {
            networkInstance.destroy();
        }

        networkInstance = new vis.Network(container, graphData, graphOptions);

        // Hide loading spinner immediately since physics is disabled
        const loader = document.getElementById('network-loading');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.classList.add('hidden'), 500);
        }

        // Node click triggers details panel update
        networkInstance.on("click", (params) => {
            if (params.nodes.length > 0) {
                const clickedCas = params.nodes[0];
                const comp = nodesLookup[clickedCas];
                if (comp) {
                    showNetNodeDetails(comp);
                }
            } else {
                selectedNodeDetails.classList.add('hidden');
            }
        });
    }

    function showNetNodeDetails(comp) {
        selectedNetNode = comp;
        netNodeName.textContent = comp.name;
        netNodeCas.textContent = comp.cas;
        netNodeFormula.textContent = comp.formula;

        if (networkInstance) {
            const degree = networkInstance.getConnectedNodes(comp.cas).length;
            netNodeNeighbors.textContent = `${degree} connections`;
        } else {
            netNodeNeighbors.textContent = "-";
        }
        selectedNodeDetails.classList.remove('hidden');
    }

    netSelectMainBtn.addEventListener('click', () => {
        if (selectedNetNode) {
            // 1. Select the molecule A in analyzer
            selectMoleculeA(selectedNetNode);
            // 2. Scroll the selected item into view in the sidebar list
            document.querySelectorAll('.compound-item').forEach(el => {
                const casSpan = el.querySelector('.comp-cas');
                if (casSpan && casSpan.textContent.trim() === selectedNetNode.cas) {
                    el.scrollIntoView({ block: 'nearest' });
                }
            });
            // 3. Switch tabs back to analyzer
            tabBtnAnalyzer.click();
        }
    });

    // Slider listener with threshold updating
    thresholdSlider.addEventListener('input', (e) => {
        currentThreshold = parseFloat(e.target.value);
        thresholdValLabel.textContent = currentThreshold.toFixed(2);
        
        // Debounce update to avoid slider lag
        clearTimeout(window.sliderTimeout);
        window.sliderTimeout = setTimeout(() => {
            if (activeTab === 'network') {
                renderVisNetwork();
            }
        }, 150);
    });

    if (similarityLimitSelect) {
        similarityLimitSelect.addEventListener('change', () => {
            if (selectedMolA) {
                renderSimilarityHub(selectedMolA.cas);
            }
        });
    }

    // Initialize Everything
    if (window.location.protocol === 'file:') {
        totalCountLabel.textContent = "CORS Security Warning";
        compoundList.innerHTML = `<li class="empty-state" style="color: #ff5b5b; padding: 20px;">
            <strong>CORS Blocked:</strong> You opened this file directly from the filesystem (file://).<br><br>
            Modern browsers block local fetches due to security restrictions.<br><br>
            Please access the page via the local server:<br>
            <a href="http://localhost:8000/" target="_blank" style="color: var(--gold); text-decoration: underline; font-weight: bold;">http://localhost:8000/</a>
        </li>`;
    } else {
        initChart();
        loadData();
    }
});
