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
    ALWAYS mention a specific job that ties back to what you are talking about.
    For each job featured, ALWAYS include the job listing url. THIS IS VERY IMPORTANT!
    Generate the post in plain text. DO NOT include any markdown or special formatting.
    DO NOT USE **, __, or any other special characters for emphasis. USE PLAIN TEXT ONLY.
    Keep the post under 1500 characters.
    Where you can include the #hiring hashtag, please do so.
    Use passive voice and British English, and ensure date formats follow the day month year format (e.g., 25 December 2023).
    Highlight the opportunities for making a positive impact in the community.
    Keep the tone hopeful and professional yet approachable.`
  })

  return result.text
}