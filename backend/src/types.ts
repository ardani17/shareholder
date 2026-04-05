// Shared TypeScript interfaces for Shareholder Mapping

// --- API Datasaham Response Types ---

export interface EmitenListResponse {
  data: Array<{ symbol: string; name: string }>;
}

export interface EmitenProfileResponse {
  symbol: string;
  name: string;
  shareholders: Array<{ name: string; percentage: number }>;
}

// --- Raw API response types (actual Datasaham.io format) ---

export interface RawSectorsResponse {
  success: boolean;
  data: {
    data: Array<{ id: string; name: string; alias1: string; parent: string }>;
  };
}

export interface RawSubsectorsResponse {
  success: boolean;
  data: {
    data: Array<{ id: string; name: string; alias1: string; parent: string }>;
  };
}

export interface RawCompaniesResponse {
  success: boolean;
  data: {
    data: Array<{
      symbol: string;
      name: string;
      company_status: string;
      type_company: string;
    }>;
  };
}

export interface RawProfileResponse {
  success: boolean;
  data: {
    shareholder_one_percent?: {
      shareholder: Array<{
        name: string;
        percentage: string;
        value: string;
        type: string;
        location: string;
      }>;
      last_updated: string;
    };
    shareholder?: Array<{
      name: string;
      percentage: string;
      value: string;
    }>;
  };
}

// --- Flood Control Types ---

export interface FloodControlConfig {
  delayMs: number;
  maxConcurrency: number;
  maxRetries: number;
  initialBackoffMs: number;
}

export interface FloodControlStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  avgResponseTimeMs: number;
  consecutive429Count: number;
}

// --- Fetch Progress ---

export interface FetchProgress {
  total: number;
  success: number;
  failed: number;
  pending: number;
  isRunning: boolean;
  isPaused: boolean;
}

// --- Shareholder Analytics Types ---

export interface ShareholderSummary {
  name: string;
  emitenCount: number;
}

export interface ShareholderEmiten {
  symbol: string;
  emitenName: string;
  percentage: number;
}

export interface EmitenShareholder {
  shareholderName: string;
  percentage: number;
}

export interface CompletenessMetadata {
  processedEmitens: number;
  totalEmitens: number;
}

// --- Correlation Types ---

export interface CorrelationResult {
  shareholderName: string;
  correlationScore: number;
  commonEmitens: string[];
}

// --- Graph Types ---

export interface GraphNode {
  id: string;
  type: 'emiten' | 'shareholder';
  label: string;
  size: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  percentage: number;
}

// --- Intelligence Types ---

export interface GraphSearchResult {
  id: string;
  type: 'emiten' | 'shareholder';
  label: string;
  size: number;
}

export interface PathStep {
  from: string;
  to: string;
  via: string;
  percentage: number;
}

export interface ShareholderLeaderboard {
  name: string;
  emitenCount: number;
  totalPercentage: number;
  avgPercentage: number;
  topHolding: { symbol: string; percentage: number } | null;
}

export interface OwnershipCluster {
  shareholders: string[];
  commonEmitens: string[];
  strength: number;
}

export interface ConcentrationScore {
  symbol: string;
  emitenName: string;
  score: number;
  herfindahlIndex: number;
  topShareholderPct: number;
  shareholderCount: number;
  tier: 'highly_concentrated' | 'concentrated' | 'moderate' | 'dispersed';
}
