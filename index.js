import axios from "axios";
import express from "express";
import * as cheerio from "cheerio";
import Redis from "ioredis";

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.json({ message: "CodeChef API is running" })
});

console.log("REDIS_URL =", process.env.REDIS_URL);

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => {
    console.error("REDIS FULL ERROR");
    console.error(err);
});

const CACHE_TTL = 60 * 10;

app.get('/api/user/:username', async (req, res) => {
    const username = req.params.username.replace(/^:/, '');

    try {
        const cacheKey = `codechef:user:${username}`;
        const cached = await redis.get(cacheKey);

        if (cached) {
            console.log(`Cache HIT for : ${username}`);
            return res.json({
                success: true,
                fromCache: true,
                data: JSON.parse(cached)
            });
        }

        console.log(`Cache MISS for ${username}  --fetching from codechef`);

        const { data: html } = await axios.get(
            `https://www.codechef.com/users/${username}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );

        const $ = cheerio.load(html);

        const currentRating = parseInt($('.rating-number').first().text().trim()) || 0;
        const stars = $('.rating-star').first().text().trim() || '0*';

        const highestRatingText = $('.rating-header small').text() || '';
        const highestRatingMatch = highestRatingText.match(/\d+/);
        const highestRating = highestRatingMatch ? parseInt(highestRatingMatch[0]) : currentRating;

        const rankText = stars.replace('*', '').trim() + ' star';

        const ratingHistory = [];
        $('script').each((_, el) => {
            const scriptContent = $(el).html();
            if (scriptContent && scriptContent.includes('all_rating')) {
                const match = scriptContent.match(/all_rating\s*=\s*(\[.*?\]);/s);
                if (match) {
                    try {
                        const parsed = JSON.parse(match[1]);
                        parsed.forEach(entry => {
                            ratingHistory.push({
                                contestName: entry.name,
                                rating: entry.rating,
                                rank: entry.rank,
                                date: entry.end_date
                            });
                        });
                    } catch (e) { }
                }
            }
        });

        const solvedProblems = [];
        $('.problems-solved .content').find('a').each((_, el) => {
            solvedProblems.push($(el).text().trim());
        });

        let totalSolved = 0;
        $('.badge__description').each((_, el) => {
            const text = $(el).text().toLowerCase();
            if (text.includes('solving')) {
                const match = $(el).text().match(/(\d+)/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > totalSolved) totalSolved = num;
                }
            }
        });

        const contestText = $('.contest-participated-count').first().text().trim();
        const NumberOfContest = parseInt(contestText.match(/\d+/)?.[0]) || 0;

        const calendarMap = {};
        ratingHistory.forEach(entry => {
            if (entry.date) {
                const ts = Math.floor(new Date(entry.date).getTime() / 1000);
                calendarMap[ts] = (calendarMap[ts] || 0) + 1;
            }
        });

        const data = {
            username,
            currentRating,
            highestRating,
            stars,
            rank: rankText,
            country: $('.user-country-name').text().trim() || 'N/A',
            institution: $('.user-school-name').text().trim() || 'N/A',
            NumberOfContest,
            totalSolved,
            solvedProblems,
            ratingHistory,
            submissionCalendar: JSON.stringify(calendarMap)
        };

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
        console.log(`Cached ${username} for ${CACHE_TTL / 60} minutes`);

        res.json({ success: true, fromCache: false, data });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/cache/:username', async (req, res) => {
    const username = req.params.username.replace(/^:/, '');
    await redis.del(`codechef:user:${username}`);
    res.json({ success: true, message: `Cache cleared for ${username}` });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});