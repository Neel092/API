import axios from "axios";
import express from "express";
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
    console.error("REDIS ERROR:", err.message);
});

const CACHE_TTL = 60 * 10; // 10 minutes

app.get('/api/user/:username', async (req, res) => {
    const username = req.params.username.replace(/^:/, '');

    try {
        const cacheKey = `codechef:user:${username}`;
        const cached = await redis.get(cacheKey);

        if (cached) {
            console.log(`Cache HIT for: ${username}`);
            return res.json({
                success: true,
                fromCache: true,
                data: JSON.parse(cached)
            });
        }

        console.log(`Cache MISS for ${username} -- fetching from CodeChef`);

        const { data: apiData } = await axios.get(
            `https://www.codechef.com/api/user/${username}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.codechef.com',
                    'Accept': 'application/json',
                }
            }
        );

        if (!apiData || apiData.status === 'error') {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // rating history
        const ratingHistory = (apiData.ratingData || []).map(entry => ({
            contestName: entry.name,
            rating: entry.rating,
            rank: entry.rank,
            date: entry.end_date
        }));

        // submission calendar
        const calendarMap = {};
        ratingHistory.forEach(entry => {
            if (entry.date) {
                const ts = Math.floor(new Date(entry.date).getTime() / 1000);
                calendarMap[ts] = (calendarMap[ts] || 0) + 1;
            }
        });

        const data = {
            username,
            currentRating: apiData.currentRating || 0,
            highestRating: apiData.highestRating || 0,
            stars: apiData.stars || '0*',
            rank: apiData.stars ? apiData.stars.replace('★', '').trim() + ' star' : '0 star',
            country: apiData.countryName || 'N/A',
            institution: apiData.organization || 'N/A',
            NumberOfContest: ratingHistory.length,
            totalSolved: apiData.totalSolved || 0,
            solvedProblems: apiData.solvedProblems || [],
            ratingHistory,
            submissionCalendar: JSON.stringify(calendarMap)
        };

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
        console.log(`Cached ${username} for ${CACHE_TTL / 60} minutes`);

        res.json({ success: true, fromCache: false, data });

    } catch (error) {
        console.error('Error fetching user:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// clear cache for a user
app.delete('/cache/:username', async (req, res) => {
    const username = req.params.username.replace(/^:/, '');
    await redis.del(`codechef:user:${username}`);
    res.json({ success: true, message: `Cache cleared for ${username}` });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});