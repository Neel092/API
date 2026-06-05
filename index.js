import axios from "axios";
import express from "express";
import * as cheerio from "cheerio";

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
    res.json({ message: "CodeChef API is running" })
});

app.get('/api/user/:username', async (req, res) => {

    const { username } = req.params;

    try {

        const { data: html } = await axios.get(
            `https://www.codechef.com/users/${username}`,
            {
                headers: {
                    // why we use this , we use this to pretend codechef as real browser to doesn't get block
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );

        const $ = cheerio.load(html);

        const profile = {
            username: username,
            name: $('h1.h2-style').first().text().trim() || 'N/A',
            currentRating: $('.rating-number').first().text().trim() || 'N/A',
            stars: $('.rating-star').first().text().trim() || 'N/A',
            highestRating: $('.rating-header small').text().replace('Highest Rating', '').trim() || 'N/A',
            country: $('.user-country-name').text().trim() || 'N/A',
            institution: $('.user-school-name').text().trim() || 'N/A',
            lastactive: $('.lastactive').text().trim() || 'N/A',
        };

        res.json({ success: true, data: profile });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }

});


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});