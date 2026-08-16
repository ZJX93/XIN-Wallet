/**
 * 服务器地址配置与归一化。
 * 用户填写 https://host:18888（或带 /api 后缀），统一规整为 https://host:18888/api/
 * 以正确拼接各接口路径（与安卓端 normalizeBaseUrl 行为一致）。
 */
export const AUTH_HEADER = 'Authorization';
export const BOOK_HEADER = 'X-Book-Id';

export function normalizeBaseUrl(input: string): string {
  let url = (input ?? '').trim();
  if (!url) {
    return '';
  }
  // 去掉末尾斜杠
  url = url.replace(/\/+$/, '');
  // 若已含 /api 段，先去掉再统一追加
  url = url.replace(/\/api$/, '');
  // 补全协议
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }
  return url + '/api/';
}
