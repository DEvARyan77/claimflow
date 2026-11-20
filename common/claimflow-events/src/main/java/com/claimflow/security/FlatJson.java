package com.claimflow.security;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tiny JSON reader/writer for flat objects whose values are strings, whole numbers, booleans or null:
 * exactly what a JWT payload needs. Keeps the shared module free of a JSON library, so it works the
 * same in the servlet services and in the reactive gateway.
 */
final class FlatJson {

    private FlatJson() {
    }

    static String write(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            string(sb, e.getKey());
            sb.append(':');
            Object v = e.getValue();
            if (v == null) sb.append("null");
            else if (v instanceof Number || v instanceof Boolean) sb.append(v);
            else string(sb, v.toString());
        }
        return sb.append('}').toString();
    }

    private static void string(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }

    static Map<String, Object> read(String json) {
        Reader r = new Reader(json);
        Map<String, Object> map = new LinkedHashMap<>();
        r.skip();
        r.expect('{');
        r.skip();
        if (r.peek() == '}') {
            r.pos++;
            return map;
        }
        while (true) {
            r.skip();
            String key = r.string();
            r.skip();
            r.expect(':');
            r.skip();
            map.put(key, r.value());
            r.skip();
            char c = r.next();
            if (c == '}') break;
            if (c != ',') throw new IllegalArgumentException("Expected , or }");
        }
        r.skip();
        if (r.pos != json.length()) throw new IllegalArgumentException("Trailing characters");
        return map;
    }

    private static final class Reader {
        private final String s;
        private int pos;

        Reader(String s) {
            this.s = s;
        }

        char peek() {
            if (pos >= s.length()) throw new IllegalArgumentException("Unexpected end");
            return s.charAt(pos);
        }

        char next() {
            char c = peek();
            pos++;
            return c;
        }

        void expect(char c) {
            if (next() != c) throw new IllegalArgumentException("Expected " + c);
        }

        void skip() {
            while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++;
        }

        Object value() {
            char c = peek();
            if (c == '"') return string();
            if (s.startsWith("null", pos)) { pos += 4; return null; }
            if (s.startsWith("true", pos)) { pos += 4; return true; }
            if (s.startsWith("false", pos)) { pos += 5; return false; }
            int start = pos;
            if (c == '-') pos++;
            while (pos < s.length() && Character.isDigit(s.charAt(pos))) pos++;
            if (start == pos || (c == '-' && pos == start + 1)) throw new IllegalArgumentException("Bad value");
            return Long.parseLong(s.substring(start, pos));
        }

        String string() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') return sb.toString();
                if (c != '\\') {
                    sb.append(c);
                    continue;
                }
                char e = next();
                switch (e) {
                    case '"', '\\', '/' -> sb.append(e);
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'u' -> {
                        sb.append((char) Integer.parseInt(s.substring(pos, pos + 4), 16));
                        pos += 4;
                    }
                    default -> throw new IllegalArgumentException("Bad escape");
                }
            }
        }
    }
}
