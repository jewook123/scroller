const axios = require('axios');

// Reddit public JSON API — no API key required
async function fetchRedditImages(subreddit, sort, page) {
  // Reddit pagination uses 'after' token, but for simplicity we use page offset via count
  const count = (page - 1) * 25;
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=25&count=${count}`;

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'gallery-scroller/1.0 (personal image viewer)',
      'Accept': 'application/json',
    },
    timeout: 12000,
  });

  const posts = res.data?.data?.children || [];
  const images = [];

  for (const post of posts) {
    const d = post.data;
    if (d.over_18) continue; // skip NSFW

    // Direct image URL
    if (d.url && d.url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
      images.push({ src: d.url, title: d.title, postUrl: `https://www.reddit.com${d.permalink}` });
      continue;
    }

    // Reddit gallery (multiple images)
    if (d.is_gallery && d.media_metadata) {
      for (const item of Object.values(d.media_metadata)) {
        if (item.status !== 'valid') continue;
        const src = item.s?.u?.replace(/&amp;/g, '&');
        if (src) images.push({ src, title: d.title, postUrl: `https://www.reddit.com${d.permalink}` });
      }
      continue;
    }

    // Reddit-hosted image (i.redd.it)
    if (d.url && d.url.includes('i.redd.it')) {
      images.push({ src: d.url, title: d.title, postUrl: `https://www.reddit.com${d.permalink}` });
    }
  }

  return images;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { subreddit = 'analog', sort = 'hot', page = '1' } = req.query;

  try {
    const images = await fetchRedditImages(subreddit, sort, parseInt(page));
    res.json({ images, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: '이미지를 불러오지 못했습니다: ' + err.message });
  }
};
