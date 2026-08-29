import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Key,
  Shield,
  Clock,
  Code2,
  AlertTriangle,
  Server,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Input';
import { PageHeader } from '../components/ui/PageHeader';
import { apisService } from '../services/apisService';
import { ApiConfig } from '../types/api';

export const DocsPage: React.FC = () => {
  const [apis, setApis] = useState<ApiConfig[]>([]);
  const [selectedApiId, setSelectedApiId] = useState<string>('');
  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    apisService.getAll().then((data) => {
      setApis(data);
      if (data.length > 0) setSelectedApiId(data[0].id);
    });
  }, []);

  const activeApi = apis.find((a) => a.id === selectedApiId) || apis[0];

  const sections = [
    { id: 'overview', title: 'Architecture Overview', icon: <Server className="w-4 h-4" /> },
    { id: 'routing', title: 'Gateway Routing', icon: <Layers className="w-4 h-4" /> },
    { id: 'auth', title: 'Authentication & Keys', icon: <Key className="w-4 h-4" /> },
    { id: 'ratelimiting', title: 'Rate Limiting & Headers', icon: <Clock className="w-4 h-4" /> },
    { id: 'errors', title: 'Error Codes & Schemas', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'examples', title: 'Multi-Language Examples', icon: <Code2 className="w-4 h-4" /> },
  ];

  const sampleCurl = `curl -X GET "http://localhost:3001/api/gateway/${activeApi?.id || 'API_ID'}/users" \\
  -H "X-API-Key: sk_live_your_api_key_here"`;

  const sampleTypeScript = `// TypeScript / JavaScript Fetch Example
async function fetchUsers() {
  const response = await fetch('http://localhost:3001/api/gateway/${activeApi?.id || 'API_ID'}/users', {
    method: 'GET',
    headers: {
      'X-API-Key': 'sk_live_your_api_key_here',
      'Content-Type': 'application/json',
    },
  });

  // Inspect Gateway Rate Limit Headers
  const limit = response.headers.get('X-RateLimit-Limit');
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const latency = response.headers.get('X-Gateway-Latency-Ms');

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    console.warn(\`Rate limit exceeded. Retry after \${retryAfter}s\`);
    return;
  }

  const data = await response.json();
  console.log(\`Received in \${latency}ms:\`, data);
  return data;
}`;

  const samplePython = `# Python requests example
import requests

url = "http://localhost:3001/api/gateway/${activeApi?.id || 'API_ID'}/users"
headers = {
    "X-API-Key": "sk_live_your_api_key_here"
}

response = requests.get(url, headers=headers)

if response.status_code == 429:
    retry_after = response.headers.get("Retry-After")
    print(f"Rate limited! Retry in {retry_after} seconds.")
else:
    print(f"Status: {response.status_code}, Latency: {response.headers.get('X-Gateway-Latency-Ms')}ms")
    print(response.json())`;

  const sampleGo = `// Go HTTP Client Example
package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("GET", "http://localhost:3001/api/gateway/${activeApi?.id || 'API_ID'}/users", nil)
	req.Header.Set("X-API-Key", "sk_live_your_api_key_here")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	fmt.Printf("Status: %s\\n", resp.Status)
	fmt.Printf("RateLimit Remaining: %s\\n", resp.Header.Get("X-RateLimit-Remaining"))
	
	body, _ := io.ReadAll(resp.Body)
	fmt.Println(string(body))
}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer Documentation"
        description="Comprehensive technical reference for integrating, authenticating, and scaling with APIShield."
        badge={
          <Badge variant="info" size="sm">
            Gateway v1.2 API
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Navigation Sticky Sidebar (3 cols) */}
        <div className="lg:col-span-3">
          <div className="sticky top-20 space-y-2 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-500 tracking-wider px-3 py-1">
              Contents
            </div>
            {sections.map((sec) => (
              <button
                key={sec.id}
                onClick={() => {
                  setActiveSection(sec.id);
                  document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  activeSection === sec.id
                    ? 'bg-zinc-800 text-emerald-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                {sec.icon}
                <span>{sec.title}</span>
              </button>
            ))}

            {apis.length > 0 && (
              <div className="pt-4 mt-2 border-t border-zinc-800 px-1">
                <label className="text-[11px] font-medium text-zinc-400 mb-1.5 block">
                  Interactive API Context
                </label>
                <Select
                  value={selectedApiId}
                  onChange={(e) => setSelectedApiId(e.target.value)}
                  options={apis.map((a) => ({ value: a.id, label: a.name }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Documentation Content (9 cols) */}
        <div className="lg:col-span-9 space-y-10">
          {/* Section 1: Overview */}
          <section id="overview" className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Server className="w-5 h-5 text-emerald-400" />
              Architecture Overview
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              APIShield acts as a reverse proxy gateway sitting between your client applications and upstream target microservices.
              Every incoming request is verified for authentication, checked against rolling sliding-window rate limit counters,
              forwarded to the upstream target, and logged with millisecond-precision roundtrip latency.
            </p>

            <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
              <div className="text-emerald-400 font-semibold font-sans text-xs">Request Lifecycle:</div>
              <div>Client Request ➔ [ 1. APIShield Key Validation ] ➔ [ 2. Sliding-Window Rate Limit Check ]</div>
              <div className="text-zinc-500 pl-4">└── If Limit Exceeded ➔ Returns HTTP 429 + Retry-After RFC Headers</div>
              <div>➔ [ 3. Forward to Upstream Target ] ➔ [ 4. Measure Latency & Log Observability ] ➔ Client Response</div>
            </div>
          </section>

          {/* Section 2: Gateway Routing */}
          <section id="routing" className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Layers className="w-5 h-5 text-sky-400" />
              Gateway Routing
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              All requests to protected APIs are routed through the standardized gateway endpoint URL pattern:
            </p>

            <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 font-mono text-xs text-sky-300">
              http://localhost:3001/api/gateway/<strong>&#123;apiId&#125;</strong>/<strong>&#123;subpath&#125;</strong>
            </div>

            <p className="text-sm text-zinc-400 leading-relaxed">
              For example, when routing through <strong className="text-zinc-200">{activeApi?.name || 'your API'}</strong>:
            </p>

            <CodeBlock
              language="bash"
              code={`# Target: ${activeApi?.targetUrl || 'https://jsonplaceholder.typicode.com'}
# Subpath: /users
GET http://localhost:3001/api/gateway/${activeApi?.id || 'API_ID'}/users`}
            />
          </section>

          {/* Section 3: Authentication */}
          <section id="auth" className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Key className="w-5 h-5 text-amber-400" />
              Authentication & API Keys
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              For APIs configured with <code className="text-emerald-400 font-mono">authRequired: true</code>,
              clients must pass a valid secret API key using one of the following methods:
            </p>

            <div className="space-y-3">
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <h4 className="text-xs font-semibold text-zinc-200 mb-1">Method 1: X-API-Key Header (Recommended)</h4>
                <code className="text-xs font-mono text-emerald-400">X-API-Key: sk_live_1a2b3c4d5e6f...</code>
              </div>
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <h4 className="text-xs font-semibold text-zinc-200 mb-1">Method 2: Bearer Authorization Header</h4>
                <code className="text-xs font-mono text-emerald-400">Authorization: Bearer sk_live_1a2b3c4d5e6f...</code>
              </div>
            </div>
          </section>

          {/* Section 4: Rate Limiting & RFC Headers */}
          <section id="ratelimiting" className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Clock className="w-5 h-5 text-purple-400" />
              Rate Limiting & Standard RFC Headers
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              APIShield implements a high-throughput sliding window rate limiter. Every response returned by the gateway
              includes standard RFC rate limit headers for programmatic client throttling:
            </p>

            <div className="overflow-x-auto border border-zinc-800 rounded-lg bg-zinc-950">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-400 font-sans">
                  <tr>
                    <th className="p-3">Response Header</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Example Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr>
                    <td className="p-3 text-emerald-400 font-bold">X-RateLimit-Limit</td>
                    <td className="p-3 font-sans">Maximum requests allowed per window.</td>
                    <td className="p-3 text-zinc-400">60</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-emerald-400 font-bold">X-RateLimit-Remaining</td>
                    <td className="p-3 font-sans">Remaining requests permitted before throttling.</td>
                    <td className="p-3 text-zinc-400">42</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-emerald-400 font-bold">X-RateLimit-Reset</td>
                    <td className="p-3 font-sans">Seconds remaining until the rate-limit window resets.</td>
                    <td className="p-3 text-zinc-400">18</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-amber-400 font-bold">Retry-After</td>
                    <td className="p-3 font-sans">Seconds to wait before retrying (sent on HTTP 429).</td>
                    <td className="p-3 text-zinc-400">12</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-sky-400 font-bold">X-Gateway-Latency-Ms</td>
                    <td className="p-3 font-sans">Upstream roundtrip response duration.</td>
                    <td className="p-3 text-zinc-400">48</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 5: Error Codes & JSON Schemas */}
          <section id="errors" className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 pb-2 border-b border-zinc-800">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Error Responses & JSON Schemas
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              When a request is blocked or fails, APIShield returns a structured JSON payload:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-amber-400 mb-1.5">HTTP 429 (Rate Limit Exceeded)</h4>
                <CodeBlock
                  language="json"
                  code={`{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too Many Requests. Rate limit of 60 requests per 1 minute exceeded.",
    "statusCode": 429,
    "rateLimit": 60,
    "retryAfterSeconds": 14,
    "timestamp": "2026-08-27T12:00:00.000Z"
  }
}`}
                />
              </div>

              <div>
                <h4 className="text-xs font-semibold text-rose-400 mb-1.5">HTTP 401 (Unauthorized)</h4>
                <CodeBlock
                  language="json"
                  code={`{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Invalid API key or key not authorized for this API.",
    "statusCode": 401,
    "timestamp": "2026-08-27T12:00:00.000Z"
  }
}`}
                />
              </div>
            </div>
          </section>

          {/* Section 6: Code Examples */}
          <section id="examples" className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 pb-2 border-b border-zinc-800">
              <Code2 className="w-5 h-5 text-emerald-400" />
              Multi-Language Integration Code
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Copy-pasteable implementation snippets customized for <strong className="text-zinc-200">{activeApi?.name}</strong>:
            </p>

            <div className="space-y-4">
              <CodeBlock title="cURL" language="bash" code={sampleCurl} />
              <CodeBlock title="TypeScript / Fetch" language="typescript" code={sampleTypeScript} />
              <CodeBlock title="Python (requests)" language="python" code={samplePython} />
              <CodeBlock title="Go (net/http)" language="go" code={sampleGo} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
