const axios = require('axios');
const cheerio = require('cheerio');

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://gall.dcinside.com/',
};

async function fetchDCInsideImages(galleryId, galleryType, page) {
  const baseUrl = galleryType === 'minor'
    ? `https://gall.dcinside.com/mgallery/board/lists/?id=${galleryId}&page=${page}`
    : `https://gall.dcinside.com/board/lists/?id=${galleryId}&page=${page}`;

  const listRes = await axios.get(baseUrl, { headers: browserHeaders, timeout: 10000 });
  const $ = cheerio.load(listRes.data);

  const postLinks = [];
  $('tr.ub-content').each((_, el) => {
    const $el = $(el);
    if ($el.find('td.gall_img').length > 0 || $el.find('em.icon_img').length > 0) {
      const href = $el.find('td.gall_tit a').first().attr('href');
      if (href) postLinks.push('https://gall.dcinside.com' + href);
    }
  });

  const images = [];
  await Promise.allSettled(
    postLinks.slice(0, 8).map(async (postUrl) => {
      try {
        const postRes = await axios.get(postUrl, {
          headers: { ...browserHeaders, Referer: baseUrl },
          timeout: 8000,
        });
        const $$ = cheerio.load(postRes.data);
        const title = $$('.gallview_head .title_txt').text().trim() || $$('h4.title').text().trim();

        $$('.write_div img, .s_write img').each((_, img) => {
          let src = $$(img).attr('src') || $$(img).attr('data-src');
          if (src && !src.includes('dccon') && !src.includes('icon') && src.startsWith('http')) {
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

  const { galleryId, galleryType = 'minor', page = '1' } = req.query;
  if (!galleryId) return res.status(400).json({ error: 'galleryId is required' });

  try {
    const images = await fetchDCInsideImages(galleryId, galleryType, parseInt(page));
    res.json({ images, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: '이미지를 불러오지 못했습니다: ' + err.message });
  }
};
