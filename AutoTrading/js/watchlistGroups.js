const STORAGE_KEY = 'autotrading_watchlist_groups_v1';

export const WATCHLIST_TYPE_OPTIONS = [
    { value: 'realtime', label: '실시간조회' },
    { value: 'movers', label: '상승률/하락률' },
    { value: 'volume', label: '거래량 상위' },
    { value: 'volumeSpike', label: '거래량 급증' },
    { value: 'domesticTradeTop', label: '개인/기관 매매상위' },
    { value: 'foreignInstitutionTop', label: '외국인/기관 매매상위' },
    { value: 'sector', label: '섹터상위' },
    { value: 'manual', label: '직접 추가' },
];

function createId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `wl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function nextGroupNumber(groups) {
    if (!groups.length) return 1;
    return Math.max(...groups.map((group) => Number(group.number) || 0)) + 1;
}

export function loadWatchlistState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { groups: [], activeGroupId: null };
        }
        const parsed = JSON.parse(raw);
        const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
        return {
            groups: groups.map(normalizeGroup),
            activeGroupId: parsed.activeGroupId || null,
        };
    } catch {
        return { groups: [], activeGroupId: null };
    }
}

export function saveWatchlistState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        groups: state.groups.map(normalizeGroup),
        activeGroupId: state.activeGroupId || null,
    }));
}

function normalizeGroup(group) {
    return {
        id: group.id || createId(),
        number: Number(group.number) || 1,
        name: String(group.name || '').trim(),
        type: group.type || 'manual',
        topLimit: Math.min(Math.max(Number(group.topLimit) || 20, 1), 100),
        stocks: Array.isArray(group.stocks)
            ? group.stocks
                .map((stock) => ({
                    code: String(stock.code || '').trim(),
                    name: String(stock.name || '').trim(),
                }))
                .filter((stock) => stock.code)
            : [],
    };
}

export function getWatchlistTypeLabel(type) {
    return WATCHLIST_TYPE_OPTIONS.find((option) => option.value === type)?.label || type;
}

export function getWatchlistGroupSummary(group) {
    if (group.type === 'manual') {
        return '직접 추가';
    }
    return `${getWatchlistTypeLabel(group.type)} · Top ${group.topLimit}`;
}

export function getWatchlistGroupHeading(group) {
    const customName = String(group.name || '').trim();
    if (customName) return customName;
    return getWatchlistGroupSummary(group);
}

export function getWatchlistGroupTitle(group) {
    return `★ ${group.number} ${getWatchlistGroupHeading(group)}`;
}

export function createWatchlistGroup({ name = '', type = 'manual', topLimit = 20 } = {}) {
    const state = loadWatchlistState();
    const group = normalizeGroup({
        id: createId(),
        number: nextGroupNumber(state.groups),
        name,
        type,
        topLimit,
        stocks: [],
    });
    state.groups.push(group);
    state.activeGroupId = group.id;
    saveWatchlistState(state);
    return group;
}

export function updateWatchlistGroup(groupId, patch) {
    const state = loadWatchlistState();
    const index = state.groups.findIndex((group) => group.id === groupId);
    if (index < 0) return null;

    state.groups[index] = normalizeGroup({
        ...state.groups[index],
        ...patch,
        id: groupId,
    });
    saveWatchlistState(state);
    return state.groups[index];
}

export function deleteWatchlistGroup(groupId) {
    const state = loadWatchlistState();
    state.groups = state.groups.filter((group) => group.id !== groupId);
    if (state.activeGroupId === groupId) {
        state.activeGroupId = state.groups[0]?.id || null;
    }
    saveWatchlistState(state);
    return state;
}

export function setActiveWatchlistGroup(groupId) {
    const state = loadWatchlistState();
    state.activeGroupId = groupId;
    saveWatchlistState(state);
    return state.groups.find((group) => group.id === groupId) || null;
}

export function getActiveWatchlistGroup() {
    const state = loadWatchlistState();
    if (!state.activeGroupId) return null;
    return state.groups.find((group) => group.id === state.activeGroupId) || null;
}

export function addStockToWatchlistGroup(groupId, stock) {
    const state = loadWatchlistState();
    const group = state.groups.find((item) => item.id === groupId);
    if (!group || group.type !== 'manual') return { group: null, added: false, reason: 'not_manual' };

    const code = String(stock.code || '').trim().replace(/^A/i, '');
    let name = String(stock.name || '').trim();
    if (!code) return { group: null, added: false, reason: 'invalid_code' };

    if (name === '종목코드 직접 조회') {
        name = '';
    }

    const exists = group.stocks.some((item) => item.code === code);
    if (exists) {
        saveWatchlistState(state);
        return { group, added: false, reason: 'duplicate' };
    }

    group.stocks.unshift({ code, name: name || code });
    saveWatchlistState(state);
    return { group, added: true, reason: null };
}

export function removeStockFromWatchlistGroup(groupId, code) {
    const state = loadWatchlistState();
    const group = state.groups.find((item) => item.id === groupId);
    if (!group) return null;

    group.stocks = group.stocks.filter((item) => item.code !== code);
    saveWatchlistState(state);
    return group;
}
