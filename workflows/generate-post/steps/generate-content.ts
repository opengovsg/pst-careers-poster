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
    - Group job listings by kind of role or by agency, whichever is more appropriate for the feature.
    - For each job group, list each job's team and job listing url in its own line, as follows: <title> - <url>
    - ALWAYS INCLUDE THE URL, IT IS IMPORTANT - It allows applicants to apply.
    - If the job group pertains to an agency, include a short sentence about what the agency does.
    - Generate the post in plain text. DO NOT include any markdown or special formatting.
    - DO NOT USE **. DO NOT USE __. NO EMPHASIS FORMATTING OF ANY KIND.
    - Keep the post under 2500 characters.
    - When mentioning an agency for the first time, use its full name followed by its abbreviation in parentheses. For example, "Government Technology Agency (GovTech)".
    - Where you can include the #hiring hashtag, please do so.
    - USE PASSIVE VOICE. DO NOT EVER REFER TO YOURSELF.
    - Use British English, and ensure date formats follow the day month year format (e.g., 25 December 2023).
    - Highlight how the roles make a positive impact in the community.
    - Keep the tone upbeat and approachable.
    - At the end of the post, include a short sentence so that readers who did not find suitable roles can still browse for other roles at go.gov.sg/pst-roles. YOU MUST STILL HAVE JOB LISTING URLS FOR EACH FEATURED JOB.`,
  })

  return result.text.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}