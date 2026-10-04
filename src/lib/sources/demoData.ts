import type { SourceRecord } from "@/types";

/**
 * DEMO SOURCE LAYER — curated seed data, not a live source connection.
 *
 * Every record below reflects a widely-attested, uncontroversial Quranic
 * verse or hadith. Text is given as a plain-meaning rendering (not a
 * verbatim quote of any single copyrighted translation) so we never assert
 * precision we cannot verify. References point to the standard
 * collection/number so a human can independently check the original.
 *
 * This file exists so the rest of the app has something real to retrieve
 * against today. Swap `demoSources` for a call into a verified API
 * (e.g. Quran.com, Sunnah.com) via the SourceAdapter interface in
 * `./types.ts` — nothing else in the app needs to change.
 */
export const demoSources: SourceRecord[] = [
  {
    id: "quran-2-255",
    type: "quran",
    reference: "Quran 2:255",
    title: "Ayat al-Kursi (The Throne Verse)",
    text: "Meaning: Allah — there is no deity except Him, the Ever-Living, the Sustainer of all existence. Neither drowsiness nor sleep overtakes Him. To Him belongs all that is in the heavens and all that is on the earth. His knowledge encompasses all things, and His authority extends over the heavens and the earth, and preserving them does not tire Him. He is the Most High, the Most Great.",
    tags: ["tawhid", "allah", "throne verse", "ayat al-kursi", "attributes of allah", "oneness of god"],
    isDemo: true,
    sourceUrl: "https://alquran.cloud/ayah/2:255",
    provider: "BASEERAH Demo Source Layer",
  },
  {
    id: "bukhari-1-intentions",
    type: "hadith",
    reference: "Sahih al-Bukhari 1",
    collection: "Sahih al-Bukhari",
    grade: "Sahih (authentic)",
    title: "Actions Are Judged by Intentions",
    text: "Meaning: The Prophet (peace be upon him) said that actions are judged by intentions, and every person will be rewarded only according to what they intended.",
    tags: ["intention", "niyyah", "actions", "sincerity", "reward"],
    isDemo: true,
    sourceUrl: "https://sunnah.com/bukhari:1",
    provider: "BASEERAH Demo Source Layer",
  },
  {
    id: "bukhari-8-five-pillars",
    type: "hadith",
    reference: "Sahih al-Bukhari 8",
    collection: "Sahih al-Bukhari / Sahih Muslim",
    grade: "Sahih (authentic)",
    title: "The Five Pillars of Islam",
    text: "Meaning: The Prophet (peace be upon him) said Islam is built upon five pillars: testifying that there is no deity but Allah and that Muhammad is His messenger, establishing prayer, giving zakah, making pilgrimage to the House for those able, and fasting the month of Ramadan.",
    tags: ["five pillars", "shahada", "salah", "prayer", "zakah", "hajj", "sawm", "fasting", "pillars of islam"],
    isDemo: true,
    sourceUrl: "https://sunnah.com/bukhari:8",
    provider: "BASEERAH Demo Source Layer",
  },
  {
    id: "tirmidhi-413-prayer-first",
    type: "hadith",
    reference: "Sunan al-Tirmidhi 413",
    collection: "Sunan al-Tirmidhi",
    grade: "Hasan (variant chains exist across collections)",
    title: "Prayer as the First Deed Judged",
    text: "Meaning: It is reported that the first matter a person will be held accountable for on the Day of Judgment is their prayer (salah); if it is sound, the rest of their deeds follow, and if it is deficient, the rest are affected.",
    tags: ["prayer", "salah", "day of judgment", "accountability", "deeds"],
    isDemo: true,
    sourceUrl: "https://sunnah.com/tirmidhi:413",
    provider: "BASEERAH Demo Source Layer",
  },
  {
    id: "bukhari-38-ramadan-forgiveness",
    type: "hadith",
    reference: "Sahih al-Bukhari 38",
    collection: "Sahih al-Bukhari / Sahih Muslim",
    grade: "Sahih (authentic)",
    title: "Reward of Fasting Ramadan",
    text: "Meaning: The Prophet (peace be upon him) said that whoever fasts the month of Ramadan out of sincere faith and in anticipation of reward from Allah will have their previous sins forgiven. This forgiveness is tied to sincerity and faith, not fasting alone, and refers to minor sins.",
    tags: ["ramadan", "fasting", "sawm", "forgiveness of sins", "reward", "faith"],
    isDemo: true,
    sourceUrl: "https://sunnah.com/bukhari:38",
    provider: "BASEERAH Demo Source Layer",
  },
  {
    id: "bukhari-1773-hajj-mabrur",
    type: "hadith",
    reference: "Sahih al-Bukhari 1773",
    collection: "Sahih al-Bukhari / Sahih Muslim",
    grade: "Sahih (authentic)",
    title: "Reward of an Accepted Hajj",
    text: "Meaning: The Prophet (peace be upon him) said that an accepted Hajj (Hajj Mabrur) has no reward less than Paradise.",
    tags: ["hajj", "pilgrimage", "paradise", "reward", "mabrur"],
    isDemo: true,
    sourceUrl: "https://sunnah.com/bukhari:1773",
    provider: "BASEERAH Demo Source Layer",
  },
  {
    id: "muslim-2699-ease-a-hardship",
    type: "hadith",
    reference: "Sahih Muslim 2699",
    collection: "Sahih Muslim",
    grade: "Sahih (authentic)",
    title: "Relieving a Believer's Hardship",
    text: "Meaning: The Prophet (peace be upon him) said that whoever relieves a believer of a worldly hardship, Allah will relieve them of a hardship on the Day of Judgment.",
    tags: ["charity", "kindness", "hardship", "believer", "day of judgment"],
    isDemo: true,
    sourceUrl: "https://sunnah.com/muslim:2699",
    provider: "BASEERAH Demo Source Layer",
  },
];
