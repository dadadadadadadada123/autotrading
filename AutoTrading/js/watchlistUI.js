import {
    WATCHLIST_TYPE_OPTIONS,
    addStockToWatchlistGroup,
    createWatchlistGroup,
    deleteWatchlistGroup,
    getActiveWatchlistGroup,
    getWatchlistGroupSummary,
    getWatchlistGroupHeading,
    getWatchlistGroupTitle,
    getWatchlistTypeLabel,
    loadWatchlistState,
    removeStockFromWatchlistGroup,
    setActiveWatchlistGroup,
    updateWatchlistGroup,
} from './watchlistGroups.js';

export function initWatchlistUI(deps) {
    const {
        authFetch,
        escapeHtml,
        formatNumber,
        openTradingPage,
        rankingList,
        rankingTitle,
        rankingSubtitle,
        rankingStatus,
        setRankingStatus,
        rankingColumns,
        rankingRefresh,
        setHomeView,
        clearRankingTabActive,
        homeRankingShell,
        rankingTabs,
    } = deps;

    const watchlistTabsEl = document.getElementById('watchlistGroupTabs');
    const watchlistModal = document.getElementById('watchlistGroupModal');
    const watchlistModalClose = document.getElementById('watchlistGroupModalClose');
    const watchlistGroupNameInput = document.getElementById('watchlistGroupName');
    const watchlistGroupTypeSelect = document.getElementById('watchlistGroupType');
    const watchlistGroupTopInput = document.getElementById('watchlistGroupTop');
    const watchlistGroupTopField = document.getElementById('watchlistGroupTopField');
    const watchlistGroupAddBtn = document.getElementById('watchlistGroupAddBtn');
    const watchlistGroupListEl = document.getElementById('watchlistGroupList');
    const watchlistOpenModalBtn = document.getElementById('watchlistOpenModalBtn');

    const watchlistAddBar = document.getElementById('watchlistAddBar');
    const watchlistAddForm = document.getElementById('watchlistAddForm');
    const watchlistAddInput = document.getElementById('watchlistAddInput');
    const watchlistAddResults = document.getElementById('watchlistAddResults');

    let editingGroupId = null;
    let watchlistAbortController = null;
    let isWatchlistMode = false;
    let watchlistAddTimer = null;
    let watchlistAddResultsData = [];

    const renderTypeOptions = () => {
        if (!watchlistGroupTypeSelect) return;
        watchlistGroupTypeSelect.innerHTML = WATCHLIST_TYPE_OPTIONS
            .map((option) => `<option value="${option.value}">${option.label}</option>`)
            .join('');
    };

    const toggleTopField = () => {
        const isManual = watchlistGroupTypeSelect?.value === 'manual';
        watchlistGroupTopField?.classList.toggle('is-hidden', isManual);
    };

    const renderWatchlistTabs = () => {
        if (!watchlistTabsEl) return;
        const { groups, activeGroupId } = loadWatchlistState();

        const tabButtons = groups.map((group) => `
            <button
                class="home-watchlist-tab${group.id === activeGroupId && isWatchlistMode ? ' is-active' : ''}"
                type="button"
                data-watchlist-id="${escapeHtml(group.id)}"
                title="${escapeHtml(getWatchlistGroupTitle(group))}"
            >
                <i class="fa-solid fa-star" aria-hidden="true"></i>
                <span>${escapeHtml(group.name?.trim() || String(group.number))}</span>
            </button>
        `).join('');

        watchlistTabsEl.innerHTML = `
            <div class="home-watchlist-tabs-inner">
                ${tabButtons}
                <button id="watchlistOpenModalBtn" class="home-watchlist-tab home-watchlist-tab-add" type="button">
                    <i class="fa-solid fa-star" aria-hidden="true"></i>
                    <span>관심 그룹 +</span>
                </button>
            </div>
        `;

        watchlistTabsEl.querySelectorAll('[data-watchlist-id]').forEach((button) => {
            button.addEventListener('click', () => {
                selectWatchlistGroup(button.dataset.watchlistId);
            });
        });

        document.getElementById('watchlistOpenModalBtn')?.addEventListener('click', openWatchlistModal);
    };

    const renderWatchlistGroupList = () => {
        if (!watchlistGroupListEl) return;
        const { groups } = loadWatchlistState();

        if (!groups.length) {
            watchlistGroupListEl.innerHTML = '<div class="watchlist-group-empty">등록된 관심 그룹이 없습니다.</div>';
            return;
        }

        watchlistGroupListEl.innerHTML = groups.map((group) => `
            <div class="watchlist-group-item" data-group-id="${escapeHtml(group.id)}">
                <div class="watchlist-group-item-main">
                    <span class="watchlist-group-item-star"><i class="fa-solid fa-star" aria-hidden="true"></i> ${escapeHtml(String(group.number))}</span>
                    <span class="watchlist-group-item-label">${escapeHtml(getWatchlistGroupSummary(group))}</span>
                    ${group.name ? `<span class="watchlist-group-item-name">${escapeHtml(group.name)}</span>` : ''}
                </div>
                <div class="watchlist-group-item-actions">
                    <button class="watchlist-group-edit" type="button" data-group-id="${escapeHtml(group.id)}" aria-label="그룹 수정">
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                    <button class="watchlist-group-delete" type="button" data-group-id="${escapeHtml(group.id)}" aria-label="그룹 삭제">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `).join('');

        watchlistGroupListEl.querySelectorAll('.watchlist-group-edit').forEach((button) => {
            button.addEventListener('click', () => startEditGroup(button.dataset.groupId));
        });

        watchlistGroupListEl.querySelectorAll('.watchlist-group-delete').forEach((button) => {
            button.addEventListener('click', () => {
                if (!confirm('이 관심 그룹을 삭제할까요?')) return;
                deleteWatchlistGroup(button.dataset.groupId);
                renderWatchlistGroupList();
                renderWatchlistTabs();
                const active = getActiveWatchlistGroup();
                if (active && isWatchlistMode) {
                    loadWatchlistGroup(active.id);
                } else if (isWatchlistMode) {
                    isWatchlistMode = false;
                    setHomeView('ranking');
                }
            });
        });
    };

    const resetWatchlistForm = () => {
        editingGroupId = null;
        if (watchlistGroupNameInput) watchlistGroupNameInput.value = '';
        if (watchlistGroupTypeSelect) watchlistGroupTypeSelect.value = 'manual';
        if (watchlistGroupTopInput) watchlistGroupTopInput.value = '20';
        if (watchlistGroupAddBtn) watchlistGroupAddBtn.textContent = '+ 그룹 추가';
        toggleTopField();
    };

    const openWatchlistModal = () => {
        resetWatchlistForm();
        renderWatchlistGroupList();
        watchlistModal?.classList.remove('hidden');
        document.body.classList.add('watchlist-modal-open');
        watchlistGroupNameInput?.focus();
    };

    const closeWatchlistModal = () => {
        resetWatchlistForm();
        watchlistModal?.classList.add('hidden');
        document.body.classList.remove('watchlist-modal-open');
    };

    const startEditGroup = (groupId) => {
        const { groups } = loadWatchlistState();
        const group = groups.find((item) => item.id === groupId);
        if (!group) return;

        editingGroupId = groupId;
        if (watchlistGroupNameInput) watchlistGroupNameInput.value = group.name || '';
        if (watchlistGroupTypeSelect) watchlistGroupTypeSelect.value = group.type;
        if (watchlistGroupTopInput) watchlistGroupTopInput.value = String(group.topLimit);
        if (watchlistGroupAddBtn) watchlistGroupAddBtn.textContent = '그룹 저장';
        toggleTopField();
    };

    const handleSaveGroup = () => {
        const name = watchlistGroupNameInput?.value.trim() || '';
        const type = watchlistGroupTypeSelect?.value || 'manual';
        const topLimit = Number(watchlistGroupTopInput?.value) || 20;

        if (editingGroupId) {
            updateWatchlistGroup(editingGroupId, { name, type, topLimit });
        } else {
            createWatchlistGroup({ name, type, topLimit });
        }

        resetWatchlistForm();
        renderWatchlistGroupList();
        renderWatchlistTabs();

        const active = getActiveWatchlistGroup();
        if (active) {
            selectWatchlistGroup(active.id);
        }
    };

    const toggleWatchlistAddBar = (group) => {
        const isManual = group?.type === 'manual';
        watchlistAddBar?.classList.toggle('is-hidden', !isManual);
        if (!isManual) {
            hideWatchlistAddResults();
            if (watchlistAddInput) watchlistAddInput.value = '';
        }
    };

    const hideWatchlistAddResults = () => {
        watchlistAddResults?.classList.add('is-hidden');
        watchlistAddResultsData = [];
        if (watchlistAddResults) watchlistAddResults.innerHTML = '';
    };

    const showWatchlistAddMessage = (message, type = 'info') => {
        if (!watchlistAddResults) return;
        watchlistAddResults.classList.remove('is-hidden');
        watchlistAddResults.innerHTML = `<div class="watchlist-add-message is-${type}">${escapeHtml(message)}</div>`;
    };

    const renderWatchlistAddResults = (results = []) => {
        if (!watchlistAddResults) return;

        watchlistAddResultsData = results;
        if (!results.length) {
            showWatchlistAddMessage('검색 결과가 없습니다.', 'empty');
            return;
        }

        watchlistAddResults.classList.remove('is-hidden');
        watchlistAddResults.innerHTML = results.map((stock, index) => `
            <button class="watchlist-add-result-item" type="button" data-index="${index}">
                <span class="watchlist-add-result-name">${escapeHtml(stock.name)}</span>
                <span class="watchlist-add-result-code">${escapeHtml(stock.code)}</span>
                <span class="watchlist-add-result-action">추가</span>
            </button>
        `).join('');
    };

    const resolveStockForWatchlist = async (stock) => {
        const code = String(stock.code || '').trim().replace(/^A/i, '');
        let name = String(stock.name || '').trim();

        if (!code) return null;

        if (!name || name === '종목코드 직접 조회' || name === code) {
            try {
                const response = await authFetch(`/api/stock/${encodeURIComponent(code)}`, { cache: 'no-store' });
                const payload = await response.json().catch(() => ({}));
                if (response.ok && payload.name) {
                    name = payload.name;
                }
            } catch {
                // 이름 조회 실패 시 코드만 사용
            }
        }

        return { code, name: name || code };
    };

    const addStockToManualGroup = async (stock, { clearInput = false } = {}) => {
        const group = getActiveWatchlistGroup();
        if (!group || group.type !== 'manual') {
            showWatchlistAddMessage('직접 추가 그룹을 먼저 선택하세요.', 'error');
            return false;
        }

        const resolved = await resolveStockForWatchlist(stock);
        if (!resolved) {
            showWatchlistAddMessage('종목 코드를 확인해 주세요.', 'error');
            return false;
        }

        const result = addStockToWatchlistGroup(group.id, resolved);
        if (result.reason === 'duplicate') {
            showWatchlistAddMessage(`"${resolved.name}"은(는) 이미 이 그룹에 있습니다.`, 'error');
            return false;
        }

        if (clearInput && watchlistAddInput) {
            watchlistAddInput.value = '';
        }
        hideWatchlistAddResults();
        await loadWatchlistGroup(group.id);
        setRankingStatus(`"${resolved.name}"을(를) 관심 종목에 추가했습니다.`, true);
        setTimeout(() => setRankingStatus('', false), 2200);
        return true;
    };

    const searchWatchlistStocks = async (query) => {
        const keyword = String(query || '').trim();
        if (!keyword) {
            hideWatchlistAddResults();
            return;
        }

        if (/^\d{6}$/.test(keyword)) {
            renderWatchlistAddResults([{ code: keyword, name: keyword }]);
            return;
        }

        try {
            showWatchlistAddMessage('검색 중...', 'info');
            const response = await authFetch(`/api/search?q=${encodeURIComponent(keyword)}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
            renderWatchlistAddResults(payload.results || []);
        } catch (error) {
            showWatchlistAddMessage(error.message || '종목 검색에 실패했습니다.', 'error');
        }
    };

    const renderWatchlistRow = (item, index, options = {}) => {
        const directionClass = item.direction === 'up' ? ' is-up' : item.direction === 'down' ? ' is-down' : '';
        const code = escapeHtml(item.code || '');
        const priceText = item.price ? `${formatNumber(item.price)}원` : '-';
        const volumeText = item.volume ? formatNumber(item.volume) : '-';
        const changeRate = item.changeRate !== null && item.changeRate !== undefined && !Number.isNaN(Number(item.changeRate))
            ? `${Number(item.changeRate).toFixed(2)}%`
            : '-';

        const removeButton = options.showRemove
            ? `<button class="home-watchlist-remove" type="button" data-remove-code="${code}" aria-label="관심 종목에서 제거" title="관심 종목에서 제거">
                    <i class="fa-solid fa-star" aria-hidden="true"></i>
               </button>`
            : '<span class="home-ranking-refresh-space" aria-hidden="true"></span>';

        return `
            <div class="home-ranking-card home-watchlist-card${directionClass}">
                <button class="home-watchlist-card-main" type="button" data-target="${code}">
                    <span class="home-ranking-rank">${escapeHtml(item.rank || index + 1)}</span>
                    <span class="home-ranking-name">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${code}</span>
                    </span>
                    <span class="home-ranking-price">${escapeHtml(priceText)}</span>
                    <span class="home-ranking-rate">${escapeHtml(changeRate)}</span>
                    <span class="home-ranking-volume">${escapeHtml(volumeText)}</span>
                </button>
                ${removeButton}
            </div>
        `;
    };

    const renderWatchlistItems = (items = [], options = {}) => {
        if (!rankingList) return;

        if (!items.length) {
            rankingList.replaceChildren();
            rankingList.classList.remove('is-mover-layout', 'is-card-layout');
            rankingList.classList.add('is-row-layout', 'is-watchlist-layout');
            const emptyMessage = options.isManual
                ? '검색창에서 종목을 찾아 관심 그룹에 추가하세요.'
                : '표시할 종목이 없습니다.';
            setRankingStatus(emptyMessage, true);
            return;
        }

        setRankingStatus('', false);
        rankingList.classList.remove('is-mover-layout', 'is-card-layout', 'is-realtime-layout');
        rankingList.classList.add('is-row-layout', 'is-watchlist-layout');
        rankingList.innerHTML = items.map((item, index) => renderWatchlistRow(item, index, options)).join('');
    };

    const fetchManualWatchlistItems = async (stocks, signal) => {
        const results = await Promise.all(stocks.map(async (stock, index) => {
            try {
                const response = await authFetch(`/api/stock/${encodeURIComponent(stock.code)}`, {
                    cache: 'no-store',
                    signal,
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);

                return {
                    rank: index + 1,
                    code: payload.code || stock.code,
                    name: payload.name || stock.name,
                    price: payload.price,
                    changeRate: payload.changeRate,
                    volume: payload.volume,
                    direction: payload.direction || 'flat',
                };
            } catch {
                return {
                    rank: index + 1,
                    code: stock.code,
                    name: stock.name,
                    price: null,
                    changeRate: null,
                    volume: null,
                    direction: 'flat',
                };
            }
        }));

        return results;
    };

    const loadWatchlistGroup = async (groupId) => {
        const { groups } = loadWatchlistState();
        const group = groups.find((item) => item.id === groupId);
        if (!group || !rankingList) return;

        isWatchlistMode = true;
        setHomeView('ranking');
        clearRankingTabActive();
        renderWatchlistTabs();

        toggleWatchlistAddBar(group);

        if (rankingTitle) {
            rankingTitle.innerHTML = `
                <i class="fa-solid fa-star home-watchlist-title-star" aria-hidden="true"></i>
                ${escapeHtml(String(group.number))}
                ${escapeHtml(getWatchlistGroupHeading(group))}
            `;
        }
        if (rankingSubtitle) {
            if (group.type === 'manual') {
                const countLabel = group.stocks.length ? `${group.stocks.length}개 종목` : '종목을 추가해 주세요';
                rankingSubtitle.textContent = `${getWatchlistGroupSummary(group)} · ${countLabel}`;
            } else {
                rankingSubtitle.textContent = getWatchlistGroupSummary(group);
            }
        }
        rankingColumns?.classList.remove('is-realtime', 'is-mover');

        rankingList.replaceChildren();
        setRankingStatus('관심 종목을 불러오는 중...', true);

        if (watchlistAbortController) {
            watchlistAbortController.abort();
        }
        watchlistAbortController = new AbortController();

        try {
            if (group.type === 'manual') {
                const items = await fetchManualWatchlistItems(group.stocks, watchlistAbortController.signal);
                renderWatchlistItems(items, { isManual: true, showRemove: true });
                return;
            }

            const limit = Math.min(Math.max(Number(group.topLimit) || 20, 1), 100);
            const response = await authFetch(
                `/api/home-rankings?type=${encodeURIComponent(group.type)}&limit=${limit}`,
                { cache: 'no-store', signal: watchlistAbortController.signal },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);

            let items = payload.items || [];
            if (group.type === 'movers' && payload.groups?.gainers) {
                items = payload.groups.gainers.slice(0, limit);
            } else {
                items = items.slice(0, limit);
            }

            renderWatchlistItems(items.map((item, index) => ({ ...item, rank: index + 1 })));
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Watchlist load failed.', error);
            rankingList.replaceChildren();
            setRankingStatus(error.message || '관심 종목을 불러오지 못했습니다.', true);
        }
    };

    const selectWatchlistGroup = (groupId) => {
        setActiveWatchlistGroup(groupId);
        loadWatchlistGroup(groupId);
    };

    const exitWatchlistMode = () => {
        isWatchlistMode = false;
        watchlistAddBar?.classList.add('is-hidden');
        hideWatchlistAddResults();
        renderWatchlistTabs();
    };

    rankingList?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('[data-remove-code]');
        if (removeButton) {
            event.preventDefault();
            event.stopPropagation();
            const group = getActiveWatchlistGroup();
            if (!group) return;
            removeStockFromWatchlistGroup(group.id, removeButton.dataset.removeCode);
            loadWatchlistGroup(group.id);
            return;
        }

        const cardButton = event.target.closest('.home-watchlist-card-main');
        if (!cardButton) return;
        openTradingPage(cardButton.dataset.target);
    });

    rankingRefresh?.addEventListener('click', () => {
        if (!isWatchlistMode) return;
        const active = getActiveWatchlistGroup();
        if (active) loadWatchlistGroup(active.id);
    });

    watchlistGroupAddBtn?.addEventListener('click', handleSaveGroup);
    watchlistGroupTypeSelect?.addEventListener('change', toggleTopField);
    watchlistModalClose?.addEventListener('click', closeWatchlistModal);
    watchlistModal?.addEventListener('click', (event) => {
        if (event.target === watchlistModal) closeWatchlistModal();
    });
    watchlistAddForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearTimeout(watchlistAddTimer);

        const keyword = watchlistAddInput?.value.trim() || '';
        if (!keyword) return;

        if (watchlistAddResultsData.length === 1) {
            await addStockToManualGroup(watchlistAddResultsData[0], { clearInput: true });
            return;
        }

        if (/^\d{6}$/.test(keyword)) {
            await addStockToManualGroup({ code: keyword, name: keyword }, { clearInput: true });
            return;
        }

        await searchWatchlistStocks(keyword);
    });

    watchlistAddInput?.addEventListener('input', () => {
        clearTimeout(watchlistAddTimer);
        const keyword = watchlistAddInput.value.trim();
        if (!keyword) {
            hideWatchlistAddResults();
            return;
        }
        watchlistAddTimer = setTimeout(() => searchWatchlistStocks(keyword), 280);
    });

    watchlistAddResults?.addEventListener('click', async (event) => {
        const button = event.target.closest('.watchlist-add-result-item');
        if (!button) return;
        const stock = watchlistAddResultsData[Number(button.dataset.index || -1)];
        if (!stock) return;
        await addStockToManualGroup(stock, { clearInput: true });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && watchlistModal && !watchlistModal.classList.contains('hidden')) {
            closeWatchlistModal();
        }
    });

    renderTypeOptions();
    renderWatchlistTabs();

    const initial = getActiveWatchlistGroup();
    if (initial) {
        selectWatchlistGroup(initial.id);
    }

    return {
        isWatchlistMode: () => isWatchlistMode,
        getActiveWatchlistGroup,
        addStockToActiveManualGroup: async (stock) => {
            if (!isWatchlistMode) return false;
            return addStockToManualGroup(stock, { clearInput: false });
        },
        exitWatchlistMode,
        reloadActiveWatchlist: () => {
            const active = getActiveWatchlistGroup();
            if (active && isWatchlistMode) loadWatchlistGroup(active.id);
        },
    };
}
