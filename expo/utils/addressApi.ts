export interface AddressSuggestion {
  label: string;
  housenumber?: string;
  street?: string;
  postcode: string;
  city: string;
  context: string;
}

interface ApiFeature {
  properties: {
    label: string;
    housenumber?: string;
    street?: string;
    name?: string;
    postcode: string;
    city: string;
    context: string;
  };
}

interface ApiResponse {
  features: ApiFeature[];
}

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchFrenchAddress(query: string): Promise<AddressSuggestion[]> {
  if (!query || query.length < 3) {
    return [];
  }

  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodedQuery}&limit=5`;
    
    console.log('[AddressAPI] Searching:', query);
    
    const response = await fetchWithTimeout(url, TIMEOUT_MS);
    
    if (!response.ok) {
      if (response.status === 504 || response.status === 503 || response.status === 502) {
        console.warn('[AddressAPI] Service temporairement indisponible:', response.status);
      } else {
        console.error('[AddressAPI] Error:', response.status);
      }
      return [];
    }

    const data: ApiResponse = await response.json();
    
    const suggestions: AddressSuggestion[] = data.features.map((feature) => ({
      label: feature.properties.label,
      housenumber: feature.properties.housenumber,
      street: feature.properties.street || feature.properties.name,
      postcode: feature.properties.postcode,
      city: feature.properties.city,
      context: feature.properties.context,
    }));

    console.log('[AddressAPI] Found', suggestions.length, 'results');
    return suggestions;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[AddressAPI] Timeout - service lent ou indisponible');
    } else {
      console.error('[AddressAPI] Fetch error:', error);
    }
    return [];
  }
}
