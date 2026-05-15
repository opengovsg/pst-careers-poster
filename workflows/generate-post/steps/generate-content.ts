import { generateText } from 'ai'
import { model } from '../../shared'

export async function generateContent(feature: string, jobs: string): Promise<string> {
  'use step'

  const result = await generateText({
    model,
    system: 'You are a recruiter for the Singapore Public Service, focusing on hiring for information technology roles. You are upbeat yet professional, and care about helping people make an impact through their work.',
    prompt: `Write a friendly and engaging LinkedIn post about the infotech roles in the following job listings from the Singapore Public Service.
    Focus on ${feature}.
    The CSV of job listings to be featured is found below:\n${jobs}\n
    You MUST follow these instructions when generating the post:
    - CRITICAL RULE — EVERY JOB LISTING MUST HAVE ITS URL ON THE SAME LINE. A post without URLs is unusable because applicants cannot apply. If you omit a URL, the post fails. The URL must be the full URL exactly as it appears in the CSV (including the trailing UUID and the utm_source/utm_medium/utm_campaign query parameters). Do not shorten, summarise, or omit any URL.
    - HARD LENGTH CAP — the final post MUST be at most 2400 characters. Aim for 2200 characters to leave a safety margin; LinkedIn will truncate anything longer with a "see more" cut. If you are close to the limit, drop lower-priority roles rather than abbreviating titles, dropping URLs, or shortening agency descriptions. Count characters before returning.
    - Group job listings by kind of role or by agency, whichever is more appropriate for the feature.
    - For each job group, list each job on its own line in EXACTLY this format: <title> - <url>
    - Example of a correctly formatted line: Cybersecurity Consultant (AI), Cybersecurity Engineering Centre - https://jobs.careers.gov.sg/jobs/hrp/17525435/005056a3-53e2-1fd1-91ed-807cdd65b3ef?utm_source=pst-careers&utm_medium=linkedin&utm_campaign=post
    - If the job group pertains to an agency, include a short sentence about what the agency does.
    - Generate the post in plain text. DO NOT include any markdown or special formatting.
    - DO NOT USE **. DO NOT USE __. NO EMPHASIS FORMATTING OF ANY KIND.
    - When mentioning an agency for the first time, use its full name followed by its abbreviation in parentheses. For example, "Government Technology Agency (GovTech)".
    - Where you can include the #hiring hashtag, please do so.
    - USE PASSIVE VOICE. DO NOT EVER REFER TO YOURSELF.
    - Use British English, and ensure date formats follow the day month year format (e.g., 25 December 2023).
    - Highlight how the roles make a positive impact in the community.
    - Keep the tone upbeat and approachable.
    - At the end of the post, include a short sentence so that readers who did not find suitable roles can still browse for other roles at go.gov.sg/pst-roles.
    - Before you finish: re-read your post and verify that (a) every job listing line contains a URL, and (b) the total character count is at most 2400. If either check fails, fix the post before returning your answer.`,
  })

  return result.text.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}