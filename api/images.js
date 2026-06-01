const axios = require('axios');
const cheerio = require('cheerio');

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://gall.dcinside.com/',
};

function buildUrl(targetUrl) {
  if (SCRAPER_API_KEY) {
    return `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&country_code=kr`;
  }
  return targetUrl;
}

async function getHtml(url, referer) {
  const headers = SCRAPER_API_KEY
    ? {}
    : { ...browserHeaders, ...(referer ? { Referer: referer } : {}) };

  const res = await axios.get(buildUrl(url), { headers, timeout: 20000 });
  return res.data;
}

async function fetchDCInsideImages(galleryId, galleryType, page) {
  const baseUrl = galleryType === 'minor'
    ? `https://gall.dcinside.com/mgallery/board/lists/?id=${galleryId}&page=${page}`
    : `https://gall.dcinside.com/board/lists/?id=${galleryId}&page=${page}`;

  const listHtml = await getHtml(baseUrl);
  const $ = cheerio.load(listHtml);

  // Collect post links that have images
  const postLinks = [];
  $('tr.ub-content').each((_, el) => {
    const $el = $(el);
    const hasImg = $el.find('td.gall_img, em.icon_img, .icon_img').length > 0;
    if (hasImg) {
      const href = $el.find('td.gall_tit a, .gall_tit a').first().attr('href');
      if (href) {
        const fullUrl = href.startsWith('http') ? href : 'https://gall.dcinside.com' + href;
        postLinks.push(fullUrl);
      }
    }
  });

  if (!postLinks.length) {
    // fallback: grab all post links if image filter found nothing
    $('tr.ub-content').each((_, el) => {
      const href = $(el).find('td.gall_tit a, .gall_tit a').first().attr('href');
      if (href && !href.includes('javascript')) {
        const fullUrl = href.startsWith('http') ? href : 'https://gall.dcinside.com' + href;
        postLinks.push(fullUrl);
      }
    });
  }

  const images = [];
  await Promise.allSettled(
    postLinks.slice(0, 8).map(async (postUrl) => {
      try {
        const html = await getHtml(postUrl, baseUrl);
        const $$ = cheerio.load(html);

        const title =
          $$('.gallview_head .title_txt').text().trim() ||
          $$('h4.title').text().trim() ||
          $$('.view_content_wrap h3').text().trim() ||
          $$('title').text().trim();

        $$('.write_div img, .s_write img, .view_content_wrap img, .appending_file_wrap img').each((_, img) => {
          let src = $$(img).attr('src') || $$(img).attr('data-src') || $$(img).attr('data-lazy');
          if (
            src &&
            src.startsWith('http') &&
            !src.includes('dccon') &&
            !src.includes('/icon') &&
            !src.includes('emoticon') &&
            !src.includes('logo')
          ) {
            images.push({ src, title, postUrl });
          }
        });
      } catch (_) {}
    })
  );

  return images;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check: return config status
  if (req.query.status) {
    return res.json({ scraperApiConfigured: !!SCRAPER_API_KEY });
  }

  const { galleryId, galleryType = 'minor', page = '1' } = req.query;
  if (!galleryId) return res.status(400).json({ error: 'galleryId is required' });

  if (!SCRAPER_API_KEY) {
    return res.status(503).json({
      error: 'SCRAPER_API_KEY 환경변수가 설정되지 않았습니다.',
      setup: 'Vercel 대시보드 → Settings → Environment Variables 에서 SCRAPER_API_KEY 를 추가하세요.',
      guide: 'https://www.scraperapi.com (무료 가입 후 API Key 발급)',
    });
  }

  try {
    const images = await fetchDCInsideImages(galleryId, galleryType, parseInt(page));
    res.json({ images, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: '이미지를 불러오지 못했습니다: ' + err.message });
  }
};
