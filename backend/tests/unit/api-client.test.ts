import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchEmitenList,
  fetchEmitenProfile,
  ApiAuthError,
  ApiRateLimitError,
  ApiError,
} from '../../src/core/api-client.js';

const API_KEY = 'test-api-key';
const BASE_URL = 'https://api.example.com';

function mockFetchResponse(body: unknown, status = 200, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('api-client', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('fetchEmitenList', () => {
    // Mock the full sectors → subsectors → companies flow
    function mockSectorsFlow(companies: Array<{ symbol: string; name: string }>) {
      return vi.fn().mockImplementation((url: string) => {
        let body: unknown;

        if (url.includes('/companies')) {
          body = {
            success: true,
            data: {
              data: companies.map(c => ({
                ...c,
                company_status: 'STATUS_ACTIVE',
                type_company: 'Saham',
              })),
            },
          };
        } else if (url.match(/\/subsectors$/)) {
          body = { success: true, data: { data: [{ id: '20', name: 'Bank', alias1: 'bank', parent: '1' }] } };
        } else if (url.match(/\/api\/sectors\/$/)) {
          body = { success: true, data: { data: [{ id: '1', name: 'Keuangan', alias1: 'keuangan', parent: '' }] } };
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(body),
        });
      });
    }

    it('should return emiten list from sectors/subsectors/companies', async () => {
      globalThis.fetch = mockSectorsFlow([
        { symbol: 'BBCA', name: 'Bank Central Asia' },
        { symbol: 'BBRI', name: 'Bank Rakyat Indonesia' },
      ]);

      const result = await fetchEmitenList(API_KEY, BASE_URL);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].symbol).toBe('BBCA');
      expect(result.data[1].symbol).toBe('BBRI');
    });

    it('should send x-api-key header on all requests', async () => {
      globalThis.fetch = mockSectorsFlow([]);

      await fetchEmitenList(API_KEY, BASE_URL);

      for (const call of (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[1].headers['x-api-key']).toBe(API_KEY);
      }
    });

    it('should throw ApiAuthError on 401', async () => {
      globalThis.fetch = mockFetchResponse(null, 401, false);

      await expect(fetchEmitenList(API_KEY, BASE_URL)).rejects.toThrow(ApiAuthError);
    });

    it('should throw ApiRateLimitError on 429', async () => {
      globalThis.fetch = mockFetchResponse(null, 429, false);

      await expect(fetchEmitenList(API_KEY, BASE_URL)).rejects.toThrow(ApiRateLimitError);
    });

    it('should throw ApiError on other HTTP errors', async () => {
      globalThis.fetch = mockFetchResponse(null, 500, false);

      await expect(fetchEmitenList(API_KEY, BASE_URL)).rejects.toThrow(ApiError);
    });

    it('should deduplicate emitens across subsectors', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        let body: unknown;
        if (url.includes('/companies')) {
          body = { success: true, data: { data: [
            { symbol: 'BBCA', name: 'BCA', company_status: 'STATUS_ACTIVE', type_company: 'Saham' },
          ] } };
        } else if (url.match(/\/subsectors$/)) {
          body = { success: true, data: { data: [
            { id: '10', name: 'Sub1', alias1: 'sub1', parent: '1' },
            { id: '11', name: 'Sub2', alias1: 'sub2', parent: '1' },
          ] } };
        } else if (url.match(/\/api\/sectors\/$/)) {
          body = { success: true, data: { data: [{ id: '1', name: 'S1', alias1: 's1', parent: '' }] } };
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      });

      const result = await fetchEmitenList(API_KEY, BASE_URL);
      expect(result.data).toHaveLength(1);
    });

    it('should throw ApiError on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      await expect(fetchEmitenList(API_KEY, BASE_URL)).rejects.toThrow(ApiError);
    });
  });

  describe('fetchEmitenProfile', () => {
    const validRawProfile = {
      success: true,
      data: {
        shareholder_one_percent: {
          shareholder: [
            { name: 'PT DWIMURIA', percentage: '54.94%', value: '67B', type: 'CP', location: 'Domestic' },
            { name: 'ANTHONI SALIM', percentage: '1.15%', value: '1.4B', type: 'ID', location: 'Domestic' },
          ],
          last_updated: '2026-04-02',
        },
        shareholder: [
          { name: 'PT DWIMURIA', percentage: '54.942%', value: '67.73 B' },
          { name: 'MASYARAKAT NON WARKAT', percentage: '42.164%', value: '51.98 B' },
        ],
      },
    };

    it('should return parsed profile with shareholders from shareholder_one_percent', async () => {
      globalThis.fetch = mockFetchResponse(validRawProfile);

      const result = await fetchEmitenProfile(API_KEY, BASE_URL, 'BBCA');

      expect(result.symbol).toBe('BBCA');
      expect(result.shareholders).toHaveLength(2);
      expect(result.shareholders[0].name).toBe('PT DWIMURIA');
      expect(result.shareholders[0].percentage).toBeCloseTo(54.94);
      expect(result.shareholders[1].name).toBe('ANTHONI SALIM');
      expect(result.shareholders[1].percentage).toBeCloseTo(1.15);
    });

    it('should call correct URL with x-api-key header', async () => {
      globalThis.fetch = mockFetchResponse(validRawProfile);

      await fetchEmitenProfile(API_KEY, BASE_URL, 'BBCA');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/emiten/BBCA/profile`,
        expect.objectContaining({
          method: 'GET',
          headers: { 'x-api-key': API_KEY },
        }),
      );
    });

    it('should throw ApiAuthError on 401', async () => {
      globalThis.fetch = mockFetchResponse(null, 401, false);
      await expect(fetchEmitenProfile(API_KEY, BASE_URL, 'BBCA')).rejects.toThrow(ApiAuthError);
    });

    it('should throw ApiRateLimitError on 429', async () => {
      globalThis.fetch = mockFetchResponse(null, 429, false);
      await expect(fetchEmitenProfile(API_KEY, BASE_URL, 'BBCA')).rejects.toThrow(ApiRateLimitError);
    });

    it('should throw ApiError on other HTTP errors', async () => {
      globalThis.fetch = mockFetchResponse(null, 404, false);
      await expect(fetchEmitenProfile(API_KEY, BASE_URL, 'XXXX')).rejects.toThrow(ApiError);
    });

    it('should throw ApiError when response has no data field', async () => {
      globalThis.fetch = mockFetchResponse({ success: true });
      await expect(fetchEmitenProfile(API_KEY, BASE_URL, 'BBCA')).rejects.toThrow(ApiError);
    });

    it('should throw ApiError on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));
      await expect(fetchEmitenProfile(API_KEY, BASE_URL, 'BBCA')).rejects.toThrow(ApiError);
    });

    it('should URL-encode the symbol parameter', async () => {
      globalThis.fetch = mockFetchResponse(validRawProfile);
      await fetchEmitenProfile(API_KEY, BASE_URL, 'A B');
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toBe(`${BASE_URL}/api/emiten/A%20B/profile`);
    });

    it('should fallback to shareholder array when shareholder_one_percent is empty', async () => {
      const profileNoOnePercent = {
        success: true,
        data: {
          shareholder: [
            { name: 'Big Holder', percentage: '50.5%', value: '100B' },
            { name: 'Small Holder', percentage: '0.5%', value: '1B' },
          ],
        },
      };
      globalThis.fetch = mockFetchResponse(profileNoOnePercent);

      const result = await fetchEmitenProfile(API_KEY, BASE_URL, 'TEST');
      // Only Big Holder (50.5%) should be included, Small Holder (0.5%) filtered out
      expect(result.shareholders).toHaveLength(1);
      expect(result.shareholders[0].name).toBe('Big Holder');
      expect(result.shareholders[0].percentage).toBeCloseTo(50.5);
    });

    it('should parse percentage strings correctly', async () => {
      const profile = {
        success: true,
        data: {
          shareholder_one_percent: {
            shareholder: [
              { name: 'Holder A', percentage: '10.123%', value: '1B', type: '', location: '' },
              { name: 'Holder B', percentage: '<0.0001%', value: '1K', type: '', location: '' },
            ],
            last_updated: '2026-01-01',
          },
        },
      };
      globalThis.fetch = mockFetchResponse(profile);

      const result = await fetchEmitenProfile(API_KEY, BASE_URL, 'TEST');
      // Only Holder A (10.123%) should be included, Holder B (<0.0001%) filtered out
      expect(result.shareholders).toHaveLength(1);
      expect(result.shareholders[0].percentage).toBeCloseTo(10.123);
    });
  });

  describe('error classes', () => {
    it('ApiError should have statusCode and message', () => {
      const err = new ApiError(503, 'Service unavailable');
      expect(err.statusCode).toBe(503);
      expect(err.message).toBe('Service unavailable');
      expect(err.name).toBe('ApiError');
      expect(err).toBeInstanceOf(Error);
    });

    it('ApiAuthError should have default message', () => {
      const err = new ApiAuthError();
      expect(err.message).toContain('Autentikasi gagal');
      expect(err.name).toBe('ApiAuthError');
      expect(err).toBeInstanceOf(Error);
    });

    it('ApiRateLimitError should have default message', () => {
      const err = new ApiRateLimitError();
      expect(err.message).toContain('429');
      expect(err.name).toBe('ApiRateLimitError');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
