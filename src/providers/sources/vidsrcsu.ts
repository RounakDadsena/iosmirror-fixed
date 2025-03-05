import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const getHost = () => {
  const urlObj = new URL(window.location.href);
  return `${urlObj.protocol}//${urlObj.host}`;
};

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  const embedPage = await ctx.proxiedFetcher(
    `https://vidsrc.su/embed/${ctx.media.type === 'movie' ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`,
    {
      headers: {
        Referer: getHost(),
      },
    },
  );
  // eslint-disable-next-line no-console
  console.log('host', getHost());

  const decodedPeterMatch = embedPage.match(/decodeURIComponent\('([^']+)'\)/);
  const decodedPeterUrl = decodedPeterMatch ? decodeURIComponent(decodedPeterMatch[1]) : null;

  const serverMatches = [...embedPage.matchAll(/label: 'Server (\d+)', url: '(https.*)'/g)];

  const servers = serverMatches.map((match) => ({
    serverNumber: parseInt(match[1], 10),
    url: match[2],
  }));

  if (decodedPeterUrl) {
    servers.push({
      serverNumber: 40,
      url: decodedPeterUrl,
    });
  }

  ctx.progress(60);

  if (!servers.length) throw new NotFoundError('No server playlist found');

  const embeds: SourcererEmbed[] = servers.map((server) => ({
    embedId: `server-${server.serverNumber}`,
    url: server.url,
  }));
  ctx.progress(90);

  return {
    embeds,
  };
}
export const vidsrcsuScraper = makeSourcerer({
  id: 'vidsrcsu',
  name: 'vidsrc.su',
  rank: 150,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
