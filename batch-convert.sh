#!/bin/bash

# 文颜批处理脚本 - 批量转换 Markdown 文件

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 显示使用帮助
show_help() {
    echo -e "${BLUE}文颜批处理工具${NC}"
    echo ""
    echo "用法: $0 [选项] <input_directory>"
    echo ""
    echo "选项:"
    echo "  -t, --theme <theme>    主题名称 (默认: default)"
    echo "  -f, --format <format>  输出格式: wechat | zhihu (默认: wechat)"
    echo "  -o, --output <dir>     输出目录 (默认: 与输入目录相同)"
    echo "  -h, --help            显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 /path/to/markdown/files"
    echo "  $0 -t rainbow -f wechat ./articles"
    echo "  $0 -t lapis -f zhihu -o ./output ./input"
    echo ""
}

# 默认参数
THEME="default"
FORMAT="wechat"
OUTPUT_DIR=""
INPUT_DIR=""

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--theme)
            THEME="$2"
            shift 2
            ;;
        -f|--format)
            FORMAT="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            echo -e "${RED}错误: 未知选项 $1${NC}" >&2
            show_help
            exit 1
            ;;
        *)
            if [[ -z "$INPUT_DIR" ]]; then
                INPUT_DIR="$1"
            else
                echo -e "${RED}错误: 多余的参数 $1${NC}" >&2
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# 检查必需参数
if [[ -z "$INPUT_DIR" ]]; then
    echo -e "${RED}错误: 缺少输入目录参数${NC}" >&2
    show_help
    exit 1
fi

# 检查输入目录是否存在
if [[ ! -d "$INPUT_DIR" ]]; then
    echo -e "${RED}错误: 输入目录不存在: $INPUT_DIR${NC}" >&2
    exit 1
fi

# 设置默认输出目录
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="$INPUT_DIR"
fi

# 创建输出目录
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}文颜批处理转换开始${NC}"
echo -e "输入目录: ${YELLOW}$INPUT_DIR${NC}"
echo -e "输出目录: ${YELLOW}$OUTPUT_DIR${NC}"
echo -e "主题: ${YELLOW}$THEME${NC}"
echo -e "格式: ${YELLOW}$FORMAT${NC}"
echo ""

# 查找所有 .md 文件
MARKDOWN_FILES=($(find "$INPUT_DIR" -name "*.md" -type f))

if [[ ${#MARKDOWN_FILES[@]} -eq 0 ]]; then
    echo -e "${YELLOW}警告: 在目录 $INPUT_DIR 中未找到 Markdown 文件${NC}"
    exit 0
fi

echo -e "${GREEN}找到 ${#MARKDOWN_FILES[@]} 个 Markdown 文件${NC}"
echo ""

# 转换计数器
SUCCESS_COUNT=0
FAIL_COUNT=0

# 批量转换
for md_file in "${MARKDOWN_FILES[@]}"; do
    # 获取相对路径和文件名
    rel_path=$(realpath --relative-to="$INPUT_DIR" "$md_file" 2>/dev/null || python3 -c "import os; print(os.path.relpath('$md_file', '$INPUT_DIR'))")
    filename=$(basename "$md_file" .md)
    output_file="$OUTPUT_DIR/${filename}.$FORMAT.html"
    
    echo -e "${BLUE}转换:${NC} $rel_path"
    
    # 执行转换
    if node "$SCRIPT_DIR/dist/cli.js" -i "$md_file" -t "$THEME" -f "$FORMAT" -o "$output_file" >/dev/null 2>&1; then
        echo -e "${GREEN}  ✅ 成功 -> $output_file${NC}"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}  ❌ 失败${NC}"
        ((FAIL_COUNT++))
    fi
done

echo ""
echo -e "${BLUE}批处理完成${NC}"
echo -e "${GREEN}成功: $SUCCESS_COUNT${NC}"
if [[ $FAIL_COUNT -gt 0 ]]; then
    echo -e "${RED}失败: $FAIL_COUNT${NC}"
fi
