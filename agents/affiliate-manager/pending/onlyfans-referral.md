# OnlyFans Referral Program — Pending Enrollment

**Date flagged:** 2026-05-03
**Program URL:** https://onlyfans.com/referral
**Reason blocked:** Requires an existing OnlyFans creator account login to generate a referral link. The referral program is account-holder-only — no external affiliate signup form exists.
**Suggested resolution:** 
1. Log in to OnlyFans with brhub0303@gmail.com
2. Navigate to Settings → Referrals (or https://onlyfans.com/referral)
3. Generate your unique referral link
4. Share with PulseNSFW affiliate manager to update the DB entry (id: 1) with the real tracking URL
5. Update DB: PUT /api/admin/affiliates/1 with {"url": "[your-referral-link]&utm_source=pulsensfw"}

---

## Pre-filled Application

**Site URL:** https://pulsensfw.com
**Category:** Adult Content / NSFW
**Monthly Visitors:** 0 (site launched 2026-05-02, actively building content base)
**Contact email:** brhub0303@gmail.com
**Payment method:** PayPal — brhub0303@gmail.com

**Brief description:**
PulseNSFW is an adult content review and editorial site covering NSFW AI chatbots, sex tech hardware, VR porn platforms, and the creator economy. We publish original reviews, rankings, and how-to guides with a direct, non-sensationalist editorial voice targeting adult audiences interested in technology-forward intimacy products and platforms.

**Program-specific notes:**
- Commission: 5% of referred creator earnings for 12 months
- This comes from OnlyFans' platform take — referred creators earn exactly what they would without the referral
- The referral link is creator-to-creator; PulseNSFW can use it in industry-news and how-to articles directed at aspiring creators
- Current DB entry (id: 1) is marked active with a bare URL; should be flagged as pending until real referral link is obtained

---

## Resolution Notes
[Leave blank until resolved. Operator adds notes here when completing manually.]
