import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';

export const viperScraper = makeEmbed({
  id: 'viper',
  name: 'Viper',
  rank: 182,
  async scrape(ctx) {
    const apiResponse = await ctx.proxiedFetcher.full<{
      source: string;
    }>(ctx.url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://embed.su/',
      },
    });

    if (!apiResponse.body.source) {
      throw new NotFoundError('No source found');
    }
    const playlistUrl = apiResponse.body.source.replace(/^.*\/viper\//, 'https://');

    return {
      stream: [
        {
          type: 'hls',
          id: 'primary',
          playlist: playlistUrl,
          flags: [flags.CORS_ALLOWED],
          captions: [],
        },
      ],
    };
  },
});
