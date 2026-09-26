import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// One Markdown file per post in src/content/blog/. The file name becomes the
// URL, so name posts `YYYY-MM-DD-short-slug.md` and never rename a published one.
const blog = defineCollection({
	loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		// Shown in the post list, the RSS feed and link previews.
		description: z.string(),
		date: z.coerce.date(),
		updated: z.coerce.date().optional(),
		// Which Accreleus project the post is about, if any.
		projects: z.array(z.enum(['quasar', 'photon', 'quasar-protocol'])).default([]),
		// A draft builds in `npm run dev` but is never published.
		draft: z.boolean().default(false),
	}),
});

export const collections = { blog };
