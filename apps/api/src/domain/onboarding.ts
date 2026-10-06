import { normalizeVerifiableOrigin } from './dns-verifier';
import { normalizeSitemapPage, previewSitemap, SITEMAP_LIMITS } from './sitemap';
import { normalizeProjectOrigin, requireUuid, ValidationError, VersioningError } from './versioning';
import { PostgresOnboardingRepository } from '../repositories/postgres-onboarding-repository';

export type OriginRecord = {id: string; origin: string; verifiedAt: string | null; verificationMethod: string | null};
export type SitemapPreview = (url: string, allowedOrigins: string[]) => Promise<{
  pages: {pathname: string; url: string}[]; duplicates: number; excluded: number;
}>;

export class OnboardingService {
  constructor(private readonly repository: PostgresOnboardingRepository,
    private readonly options: {allowLoopback?: boolean; sitemapPreview?: SitemapPreview} = {}) {}

  async origins(user: string, project: unknown) {
    return {origins: await this.repository.origins(user, requireUuid(project, 'projectId')), allowLoopback: this.options.allowLoopback === true};
  }
  addOrigin(user: string, project: unknown, value: unknown) {
    const origin = normalizeVerifiableOrigin(value, this.options.allowLoopback === true).origin;
    return this.repository.addOrigin(user, requireUuid(project, 'projectId'), origin);
  }
  removeOrigin(user: string, project: unknown, value: unknown) {
    // Existing projects may contain legacy HTTP origins. They must remain removable.
    const origin = normalizeProjectOrigin(value);
    return this.repository.removeOrigin(user, requireUuid(project, 'projectId'), origin);
  }
  async preview(user: string, project: unknown, value: unknown) {
    const origins = await this.repository.origins(user, requireUuid(project, 'projectId'));
    if (typeof value !== 'string' || !value || value.length > 2048) throw new ValidationError('Укажите URL sitemap.');
    return (this.options.sitemapPreview ?? previewSitemap)(value, origins.map(origin => origin.origin));
  }
  importPages(user: string, project: unknown, selected: unknown) {
    if (!Array.isArray(selected) || !selected.length || selected.length > SITEMAP_LIMITS.entries
      || selected.some(url => typeof url !== 'string' || url.length > 2048)) {
      throw new ValidationError(`Выберите от 1 до ${SITEMAP_LIMITS.entries} URL страниц.`);
    }
    return this.repository.importPages(user, requireUuid(project, 'projectId'), selected, (url, origins) => {
      const page = normalizeSitemapPage(url, origins);
      if (!page) throw new VersioningError('Страница не принадлежит разрешённому origin сайта.', 'SITEMAP_PAGE_NOT_ALLOWED', 400);
      return page.pathname;
    });
  }
}
