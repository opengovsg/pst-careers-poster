import { generateText } from 'ai'
import { model } from '../../shared'

export async function generateContent(trend: string, jobs: string): Promise<string> {
  'use step'

  const result = await generateText({
    model,
    system: 'You are a recruiter for the Singapore Public Service, focusing on tech hiring. You are upbeat yet professional, and care about helping people make an impact through their work.',
    prompt: `Write a friendly and engaging LinkedIn post about the tech roles in the following job listings from the Singapore Public Service.
    Focus on the following trend: ${trend}
    The CSV of job listings to be featured is found below:\n${jobs}\n
    For each job featured, ALWAYS include the url, right after the job feature.
    Generate the post in plain text. DO NOT include any markdown or special formatting.
    Where you can, use no more than 5 # topics, including #hiring .
    Use passive voice and British English, and ensure date formats follow the day month year format (e.g., 25 December 2023).
    Highlight the opportunities for making a positive impact in the community.
    Keep the tone hopeful and professional yet approachable.`
  })

  return result.text
}