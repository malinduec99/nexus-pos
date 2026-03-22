# MEC POS Hybrid Auto-Update System (GitHub + Firebase)

Mama dan system eka hadala thiyenne **Hybrid Approach** ekakata. Meken oyata Blaze plan ekata nokara updates denna puluwan.

## Meka wada karana widiya:
1.  **Web Admin/POS Logic**: Still Firebase eke (FREE Spark Plan) thiyenne. Oyage system eka speed ekata online wada karana nisa hoda security ekak thiyanawa.
2.  **App Updates (.exe)**: Dan GitHub Releases thama provider eka. Firebase block karana nisa mama GitHub hosting ekata maru kara. Meka **SAMPURNAYENMA FREE**.

---

## Aluth Update ekak denne kohomada?
Mama oyata aluth script ekak haduwa: `publish_update.bat`.
1.  Update ekak iwara unama `publish_update.bat` run karanna.
2.  Eken web eka update karala, `.exe` file eka auto GitHub ekata upload karanawa.
3.  Userslata update notification eka auto app ekatama ei.

---

## Blaze Plan eka gena kiiuwoth:
*   **Cost**: Blaze plan eka "Pay as you go" wunata, eke thiyena Free Limits godak wediyi. 
    *   Hosting Storage: First 10GB is FREE.
    *   Hosting Data Transfer: First 360MB/Day is FREE.
*   **Payment**: Oyage system eka ekkenek dekkenek use karana nisa Blaze damma kiyala **kisima gewimak wenna thiyena ida godak aduyi (LKR 0.00)**. Eth bank card ekak register karanna wenawa security ekata.
*   **Solution**: Dan api GitHub use karana nisa Blaze plan eka ganna awashyama na.

---

## How to Deploy now:
1. Web changes witarak nam: `deploy_erp.bat`
2. App eke version update ekak ekka damma nam: `publish_update.bat` (Meka run karanna kalin `package.json` eke version eka 1.4.5 kiyala wath update karanna).
