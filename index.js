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

        const currentRating = parseInt($('.rating-number').first().text().trim()) || 0;
        const stars = $('.rating-star').first().text().trim() || '0*';

        const highestRatingText = $('.rating-header small').text() || '';
        const highestRating = parseInt(highestRatingText.replace(/[^0-9]/g, '')) || currentRating;

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

        const totalSolved = solvedProblems.length;

        const calendarMap = {};
        ratingHistory.forEach(entry => {
            if (entry.date) {
                const ts = Math.floor(new Date(entry.date).getTime() / 1000);
                calendarMap[ts] = (calendarMap[ts] || 0) + 1;
            }
        });

        res.json({
            success: true,
            data: {
                username,
                currentRating,
                highestRating,
                stars,
                rank: rankText,
                country: $('.user-country-name').text().trim() || 'N/A',
                institution: $('.user-school-name').text().trim() || 'N/A',
                ratingHistory,
                solvedProblems,
                totalSolved,
                submissionCalendar: JSON.stringify(calendarMap)
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }

});


app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});