import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  base = 'http://localhost:8080/api/auth';
  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.base}/login`, { username, password });
  }

  logout(): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('sogo_token')}` });
    localStorage.removeItem('sogo_token');
    localStorage.removeItem('sogo_role');
    localStorage.removeItem('sogo_username');
    localStorage.removeItem('sogo_fullname');
    localStorage.removeItem('sogo_email');
    return this.http.post(`${this.base}/logout`, {}, { headers });
  }

  getRole(): string | null {
    return localStorage.getItem('sogo_role');
  }

  getOAuthProviders(): Observable<{ google: boolean; azure: boolean }> {
    return this.http.get<{ google: boolean; azure: boolean }>(`${this.base}/oauth-providers`);
  }

  resetRequest(email: string){
    return this.http.post(`${this.base}/reset-request`, { email });
  }

  doReset(token: string, password: string){
    return this.http.post(`${this.base}/reset`, { token, password });
  }

}
