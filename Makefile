NAME := $(shell jq -r .name manifest.json 2>/dev/null || echo my-template)
BINARY := presto-template-$(NAME)

# TypeScript 安全：禁止的 import 模式（源码 grep）
TS_IMPORT_DENY := node:http|node:https|node:net|node:dgram|node:dns|node:tls|node:child_process|node:cluster|node:worker_threads
# TypeScript 安全：禁止的 API 调用
TS_API_DENY := fetch\s*\(|XMLHttpRequest|WebSocket|new\s+URL\(.*https?:

# 当前平台构建
build:
	bun build --compile src/index.ts --outfile $(BINARY)

# 安装到 Presto 并预览
preview: build
	mkdir -p ~/.presto/templates/$(NAME)
	cp $(BINARY) ~/.presto/templates/$(NAME)/$(BINARY)
	./$(BINARY) --manifest > ~/.presto/templates/$(NAME)/manifest.json
	@echo "✓ 模板已安装到 ~/.presto/templates/$(NAME)/"
	@echo "  请在 Presto 中刷新模板列表查看效果"

# 运行测试
test: build test-security
	@echo "Testing manifest..."
	@./$(BINARY) --manifest | python3 -m json.tool > /dev/null
	@echo "Testing example round-trip..."
	@./$(BINARY) --example | ./$(BINARY) > /dev/null
	@echo "Testing version..."
	@./$(BINARY) --version > /dev/null
	@# 校验 category 字段
	@./$(BINARY) --manifest | python3 -c "\
import json, sys, re; \
m = json.load(sys.stdin); \
cat = m.get('category', ''); \
(not cat) and (print('ERROR: category is empty', file=sys.stderr) or sys.exit(1)); \
(len(cat) > 20) and (print(f'ERROR: category too long ({len(cat)} > 20)', file=sys.stderr) or sys.exit(1)); \
(not re.match(r'^[\u4e00-\u9fff\w\s-]+$$', cat)) and (print(f'ERROR: category contains invalid characters: {cat}', file=sys.stderr) or sys.exit(1)); \
print(f'  category: {cat} ✓')"
	@echo "All tests passed."

# 安全测试
test-security: build
	@echo "==> Security: source import analysis..."
	@if grep -rnE '$(TS_IMPORT_DENY)' src/; then \
		echo "SECURITY FAIL: forbidden node module imports in source"; exit 1; \
	fi
	@echo "  import analysis ✓"
	@echo "==> Security: API usage analysis..."
	@if grep -rnE '$(TS_API_DENY)' src/ | grep -v '^\s*//' | grep -v '^\s*\*'; then \
		echo "SECURITY FAIL: forbidden network API calls in source"; exit 1; \
	fi
	@echo "  API analysis ✓"
	@echo "==> Security: package.json dependency audit..."
	@FORBIDDEN=$$(jq -r '(.dependencies // {} | keys[]) + "\n" + (.devDependencies // {} | keys[])' package.json 2>/dev/null | grep -iE 'axios|node-fetch|got|superagent|request|undici' || true); \
	if [ -n "$$FORBIDDEN" ]; then \
		echo "SECURITY FAIL: forbidden network packages:"; echo "$$FORBIDDEN"; exit 1; \
	fi
	@echo "  dependency audit ✓"
	@echo "==> Security: network isolation test..."
	@if command -v sandbox-exec >/dev/null 2>&1; then \
		echo "# Test" | sandbox-exec -p '(version 1)(allow default)(deny network*)' ./$(BINARY) > /dev/null && \
		echo "  sandbox-exec (macOS) ✓"; \
	elif unshare --net true 2>/dev/null; then \
		echo "# Test" | unshare --net ./$(BINARY) > /dev/null && \
		echo "  unshare --net (Linux) ✓"; \
	else \
		echo "  SKIP: no sandbox tool available (install sandbox-exec or unshare)"; \
	fi
	@echo "==> Security: output format validation..."
	@OUTPUT=$$(./$(BINARY) --example | ./$(BINARY)); \
	if echo "$$OUTPUT" | grep -qiE '<html|<script|<iframe|<img|<link|<!DOCTYPE|<div|<span'; then \
		echo "SECURITY FAIL: stdout contains HTML"; exit 1; \
	fi; \
	if ! echo "$$OUTPUT" | head -1 | grep -q '^#'; then \
		echo "SECURITY FAIL: stdout first line does not start with Typst directive"; exit 1; \
	fi
	@echo "  output validation ✓"

# 清理
clean:
	rm -f $(BINARY)

.PHONY: build preview test test-security clean
