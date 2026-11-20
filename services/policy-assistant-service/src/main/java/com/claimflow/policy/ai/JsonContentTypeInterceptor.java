package com.claimflow.policy.ai;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRequest;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import java.io.IOException;
import java.io.InputStream;

/**
 * Some providers (e.g. Gemini's OpenAI-compatible endpoint) send JSON with the content type
 * "application/octet-stream", and Spring can't read that as JSON. Every reply from these
 * APIs is JSON, so this interceptor labels it as JSON before Spring reads it.
 */
public class JsonContentTypeInterceptor implements ClientHttpRequestInterceptor {

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        return new JsonResponse(execution.execute(request, body));
    }

    private static final class JsonResponse implements ClientHttpResponse {

        private final ClientHttpResponse delegate;
        private final HttpHeaders headers = new HttpHeaders();

        JsonResponse(ClientHttpResponse delegate) {
            this.delegate = delegate;
            delegate.getHeaders().forEach(headers::addAll);
            MediaType type = delegate.getHeaders().getContentType();
            if (type == null || !type.isCompatibleWith(MediaType.APPLICATION_JSON)) {
                headers.setContentType(MediaType.APPLICATION_JSON);
            }
        }

        @Override
        public HttpStatusCode getStatusCode() throws IOException {
            return delegate.getStatusCode();
        }

        @Override
        public String getStatusText() throws IOException {
            return delegate.getStatusText();
        }

        @Override
        public HttpHeaders getHeaders() {
            return headers;
        }

        @Override
        public InputStream getBody() throws IOException {
            return delegate.getBody();
        }

        @Override
        public void close() {
            delegate.close();
        }
    }
}
