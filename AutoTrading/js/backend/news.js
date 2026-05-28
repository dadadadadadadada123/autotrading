const https = require('https');

const DEFAULT_QUERY = '한국 주식 증시';
const CACHE_TTL_MS = 5 * 60 * 1000;

const newsCache = new Map();

function fetchText(url, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects.'));
            return;
        }

        const request = https.get(url, {
            headers: {
                'User-Agent': 'AutoTrading/1.0 (+https://localhost)',
                Accept: 'application/rss+xml, application/xml, text/xml, */*',
            },
        }, (response) => {
            const { statusCode = 0, headers: responseHeaders } = response;

            if (statusCode >= 300 && statusCode < 400 && responseHeaders.location) {
                const nextUrl = new URL(responseHeaders.location, url).toString();
                response.resume();
                fetchText(nextUrl, redirectCount + 1).then(resolve).catch(reject);
                return;
            }

            if (statusCode !== 200) {
                response.resume();
                reject(new Error(`News feed HTTP ${statusCode}`));
                return;
            }

            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => resolve(body));
        });

        request.on('error', reject);
        request.setTimeout(12000, () => {
            request.destroy(new Error('News feed request timed out.'));
        });
    });
}

function decodeXmlEntities(value) {
    return String(value ?? '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function readTag(block, tagName) {
    const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    return match ? decodeXmlEntities(match[1]) : '';
}

function formatPubDate(pubDate) {
    if (!pubDate) return '';
    const parsed = new Date(pubDate);
    if (Number.isNaN(parsed.getTime())) return pubDate;
    return parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function parseRssItems(xml) {
    const items = [];
    const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let match = itemRegex.exec(xml);

    while (match) {
        const block = match[1];
        const title = readTag(block, 'title');
        const link = readTag(block, 'link');
        const description = readTag(block, 'description');
        const pubDate = readTag(block, 'pubDate');
        const source = readTag(block, 'source');

        if (title && link) {
            items.push({
                title,
                link,
                description: description.slice(0, 220),
                pubDate: formatPubDate(pubDate),
                stock: source || '증시',
            });
        }

        match = itemRegex.exec(xml);
    }

    return items;
}

function getCacheKey(query, limit, filterKeyword) {
    return `${query}::${limit}::${filterKeyword}`;
}

function getSearchTokens(keyword) {
    return String(keyword || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

function itemContainsAllTokens(item, tokens) {
    if (!tokens.length) return true;

    const text = `${item.title} ${item.description} ${item.stock}`;
    const lowered = text.toLowerCase();

    return tokens.every((token) => {
        const trimmed = token.trim();
        if (!trimmed) return true;
        return text.includes(trimmed) || lowered.includes(trimmed.toLowerCase());
    });
}

function filterNewsByKeyword(items, keyword) {
    const tokens = getSearchTokens(keyword);
    if (!tokens.length) return items;
    return items.filter((item) => itemContainsAllTokens(item, tokens));
}

async function getStockNews(query = '', limit = 30) {
    const filterKeyword = String(query || '').trim();
    const feedQuery = filterKeyword || DEFAULT_QUERY;
    const maxItems = Math.min(Math.max(Number(limit) || 30, 1), 50);
    const cacheKey = getCacheKey(feedQuery, maxItems, filterKeyword);
    const cached = newsCache.get(cacheKey);

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.items;
    }

    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(feedQuery)}&hl=ko&gl=KR&ceid=KR:ko`;
    const xml = await fetchText(feedUrl);
    let items = parseRssItems(xml);

    if (filterKeyword) {
        items = filterNewsByKeyword(items, filterKeyword);
    }

    items = items.slice(0, maxItems);

    if (!items.length) {
        throw new Error(
            filterKeyword
                ? `"${filterKeyword}"이(가) 포함된 뉴스가 없습니다.`
                : '가져올 수 있는 주식 뉴스가 없습니다.',
        );
    }

    newsCache.set(cacheKey, { fetchedAt: Date.now(), items });
    return items;
}

module.exports = {
    getStockNews,
    filterNewsByKeyword,
};
