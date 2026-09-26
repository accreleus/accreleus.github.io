import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, postUrl } from '../../lib/posts';

export async function GET(context: APIContext) {
	const posts = await getPosts();
	return rss({
		title: 'Accreleus blog',
		description: 'Development updates on Quasar and the tools around it.',
		site: context.site!,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.date,
			link: postUrl(post),
		})),
	});
}
