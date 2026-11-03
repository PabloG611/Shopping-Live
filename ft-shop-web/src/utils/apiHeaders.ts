/**
 * Obtiene los headers necesarios para las peticiones al API Gateway
 * Incluye Authorization y BK-Service
 */
import { getAccessToken } from '../services/tokenStore';

export function getApiHeaders(): HeadersInit {
  const token = getAccessToken();
  
  return {
    'Authorization': token ? `Bearer ${token}` : '',
    'BK-Service': 'api-sgai',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}
