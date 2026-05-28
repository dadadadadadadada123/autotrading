const axios = require('axios');

// 네이버 개발자 센터 키 입력
const CLIENT_ID = '3';       
const CLIENT_SECRET = '3'; 

/**
 * 1. 공통 네이버 뉴스 호출 함수
 */
async function fetchNaverNews(searchQuery, displayCount = 5) {
  try {
    const response = await axios.get('https://openapi.naver.com/v1/search/news.json', {
      params: {
        query: searchQuery,
        display: displayCount,
        sort: 'date' // 최신순 정렬
      },
      headers: {
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET
      }
    });

    return response.data.items.map(item => ({
      title: item.title.replace(/<[^>]*>?/gm, ''), // HTML 태그 제거
      description: item.description.replace(/<[^>]*>?/gm, ''),
      link: item.link,
      pubDate: item.pubDate
    }));
  } catch (error) {
    console.error(`❌ 뉴스 검색 실패 [검색어: ${searchQuery}]:`, error.message);
    return [];
  }
}

/**
 * 2. 메인 실행 함수: 관심 종목이 있으면 종목별 뉴스, 없으면 종합 인기 뉴스 노출
 * @param {Array<string>} stockList - 관심 종목 배열 (없으면 빈 배열 [])
 */
async function renderStockNewsPage(stockList) {
  console.log(`\n==================================================`);
  console.log(`📈  주식 / 증시 실시간 뉴스 보드  📈`);
  console.log(`==================================================`);

  // 케이스 A: 관심 종목이 없을 때 (또는 상단 고정 인기 뉴스 탭)
  if (!stockList || stockList.length === 0) {
    console.log(`\n[안내] 등록된 관심 종목이 없어 '오늘의 종합 증시 뉴스'를 띄웁니다.\n`);
    
    // 시장 전체를 아우르는 금융 핵심 키워드로 검색 (인기 시황 뉴스 대체)
    const marketQuery = `(코스피 OR 코스닥 OR 증시종합 OR 뉴욕증시) 주가`;
    const marketNews = await fetchNaverNews(marketQuery, 5);

    console.log(`🔥 실시간 주요 증시 시황 (인기 뉴스)`);
    console.log(`--------------------------------------------------`);
    marketNews.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`);
      console.log(`🔗 링크: ${item.link}`);
      console.log();
    });
    console.log(`==================================================\n`);
    return;
  }

  // 케이스 B: 관심 종목이 존재할 때
  console.log(`\n⭐ 내 관심 종목 뉴스 리스트\n`);
  for (const stock of stockList) {
    const stockQuery = `${stock} (주가 OR 증시 OR 공시 OR 실적)`;
    const stockNews = await fetchNaverNews(stockQuery, 3); // 종목별 3개씩

    console.log(`📈 [${stock}] 관련 뉴스`);
    console.log(`--------------------------------------------------`);
    if (stockNews.length === 0) {
      console.log('최근 관련 뉴스가 없습니다.\n');
      continue;
    }

    stockNews.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`);
      console.log(`🔗 링크: ${item.link}`);
      console.log();
    });
    console.log(`==================================================\n`);
  }
}


/* ================= 🔥 테스트 실행 파트 ================= */

// 테스트 1: 관심 종목이 하나도 없을 때 (인기 종합 뉴스가 떠야 함)
const emptyWatchlist = [];
renderStockNewsPage(emptyWatchlist);

// 테스트 2: 관심 종목이 있을 때 (각 종목별 뉴스가 떠야 함)
// const myWatchlist = ['삼성전자', '카카오'];
// renderStockNewsPage(myWatchlist);

module.exports = { getMyWatchlistNews };