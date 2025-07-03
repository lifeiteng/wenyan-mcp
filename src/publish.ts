import { JSDOM } from "jsdom";
import { FormData, File } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import path from "path";

const tokenUrl = "https://api.weixin.qq.com/cgi-bin/token";
const publishUrl = "https://api.weixin.qq.com/cgi-bin/draft/add";
const batchGetUrl = "https://api.weixin.qq.com/cgi-bin/draft/batchget";
const deleteUrl = "https://api.weixin.qq.com/cgi-bin/draft/delete";
const uploadUrl = `https://api.weixin.qq.com/cgi-bin/material/add_material`;
const appId = process.env.WECHAT_APP_ID || "";
const appSecret = process.env.WECHAT_APP_SECRET || "";
const hostImagePath = process.env.HOST_IMAGE_PATH || "";
const dockerImagePath = "/mnt/host-downloads";

type UploadResponse = {
    media_id: string;
    url: string
};

async function fetchAccessToken() {
    try {
        const response = await fetch(`${tokenUrl}?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
        const data = await response.json();
        if (data.access_token) {
            return data;
        } else if (data.errcode) {
            throw new Error(`获取 Access Token 失败，错误码：${data.errcode}，${data.errmsg}`);
        } else {
            throw new Error(`获取 Access Token 失败: ${data}`);
        }
    } catch (error) {
        throw error;
    }
}

async function uploadMaterial(type: string, fileData: Blob | File, fileName: string, accessToken: string): Promise<UploadResponse> {
    const form = new FormData();
    form.append("media", fileData, fileName);
    const response = await fetch(`${uploadUrl}?access_token=${accessToken}&type=${type}`, {
        method: 'POST',
        body: form as any,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传失败: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    if (data.errcode) {
        throw new Error(`上传失败，错误码：${data.errcode}，错误信息：${data.errmsg}`);
    }
    const result = data.url.replace("http://", "https://");
    data.url = result;
    return data;
}

async function uploadImage(imageUrl: string, accessToken: string, fileName?: string): Promise<UploadResponse> {
    if (imageUrl.startsWith("http")) {
        const response = await fetch(imageUrl);
        if (!response.ok || !response.body) {
            throw new Error(`Failed to download image from URL: ${imageUrl}`);
        }
        const fileNameFromUrl = path.basename(imageUrl.split("?")[0]);
        const ext = path.extname(fileNameFromUrl);
        const imageName = fileName ?? (ext === "" ? `${fileNameFromUrl}.jpg` : fileNameFromUrl);
        const buffer = await response.arrayBuffer();
        return await uploadMaterial('image', new Blob([buffer]), imageName, accessToken);
    } else {
        const localImagePath = hostImagePath ? imageUrl.replace(hostImagePath, dockerImagePath) : imageUrl;
        const fileName = path.basename(localImagePath);
        const file = await fileFromPath(localImagePath);
        return await uploadMaterial('image', file, fileName, accessToken);
    }
}

async function uploadImages(content: string, accessToken: string): Promise<string> {
    const dom = new JSDOM(content);
    const document = dom.window.document;
    const images = Array.from(document.querySelectorAll('img'));
    const uploadPromises = images.map(async (element) => {
        const dataSrc = element.getAttribute('src');
        if (dataSrc) {
            if (!dataSrc.startsWith('https://mmbiz.qpic.cn')) {
                const resp = await uploadImage(dataSrc, accessToken);
                element.setAttribute('src', resp.url);
                return resp.media_id;
            } else {
                return dataSrc;
            }
        }
        return null;
    });

    const mediaIds = (await Promise.all(uploadPromises)).filter(Boolean);
    const firstImageId = mediaIds[0] || "";
    return firstImageId;
}

export async function publishToDraft(title: string, content: string, cover: string) {
    try {
        const accessToken = await fetchAccessToken();
        const firstImageId = await uploadImages(content, accessToken.access_token);
        let thumbMediaId = "";
        if (cover) {
            const resp = await uploadImage(cover, accessToken.access_token, "cover.jpg");
            thumbMediaId = resp.media_id;
        } else {
            if (firstImageId.startsWith("https://mmbiz.qpic.cn")) {
                const resp = await uploadImage(firstImageId, accessToken.access_token, "cover.jpg");
                thumbMediaId = resp.media_id;
            } else {
                thumbMediaId = firstImageId;
            }
        }
        if (!thumbMediaId) {
            throw new Error("你必须指定一张封面图或者在正文中至少出现一张图片。");
        }
        const response = await fetch(`${publishUrl}?access_token=${accessToken.access_token}`, {
            method: 'POST',
            body: JSON.stringify({
                articles: [{
                    title: title,
                    content: content,
                    thumb_media_id: thumbMediaId,
                }]
            })
        });
        const data = await response.json();
        if (data.media_id) {
            return data;
        } else if (data.errcode) {
            throw new Error(`上传到公众号草稿失败，错误码：${data.errcode}，${data.errmsg}`);
        } else {
            throw new Error(`上传到公众号草稿失败: ${data}`);
        }
    } catch (error) {
        throw error;
    }
}

export interface Article {
    title: string;
    content: string;
    cover?: string;
}

export async function publishMultipleArticlesToDraft(articles: Article[]) {
    try {
        const accessToken = await fetchAccessToken();
        
        // 处理每个文章，上传图片并获取封面
        const processedArticles = await Promise.all(articles.map(async (article) => {
            const firstImageId = await uploadImages(article.content, accessToken.access_token);
            let thumbMediaId = "";
            
            if (article.cover) {
                const resp = await uploadImage(article.cover, accessToken.access_token, "cover.jpg");
                thumbMediaId = resp.media_id;
            } else {
                if (firstImageId.startsWith("https://mmbiz.qpic.cn")) {
                    const resp = await uploadImage(firstImageId, accessToken.access_token, "cover.jpg");
                    thumbMediaId = resp.media_id;
                } else {
                    thumbMediaId = firstImageId;
                }
            }
            
            if (!thumbMediaId) {
                throw new Error(`文章 "${article.title}" 必须指定一张封面图或者在正文中至少出现一张图片。`);
            }
            
            return {
                title: article.title,
                content: article.content,
                thumb_media_id: thumbMediaId,
            };
        }));
        
        // 发布多个文章到草稿箱
        const response = await fetch(`${publishUrl}?access_token=${accessToken.access_token}`, {
            method: 'POST',
            body: JSON.stringify({
                articles: processedArticles
            })
        });
        
        const data = await response.json();
        if (data.media_id) {
            return data;
        } else if (data.errcode) {
            throw new Error(`上传到公众号草稿失败，错误码：${data.errcode}，${data.errmsg}`);
        } else {
            throw new Error(`上传到公众号草稿失败: ${data}`);
        }
    } catch (error) {
        throw error;
    }
}

export async function getDraftList(offset: number = 0, count: number = 20) {
    try {
        const accessToken = await fetchAccessToken();
        const response = await fetch(`${batchGetUrl}?access_token=${accessToken.access_token}`, {
            method: 'POST',
            body: JSON.stringify({
                offset: offset,
                count: count,
                no_content: 1
            })
        });
        const data = await response.json();
        if (data.errcode) {
            throw new Error(`获取草稿列表失败，错误码：${data.errcode}，${data.errmsg}`);
        }
        return data;
    } catch (error) {
        throw error;
    }
}

export async function deleteDraft(mediaId: string) {
    try {
        const accessToken = await fetchAccessToken();
        const response = await fetch(`${deleteUrl}?access_token=${accessToken.access_token}`, {
            method: 'POST',
            body: JSON.stringify({
                media_id: mediaId
            })
        });
        const data = await response.json();
        if (data.errcode) {
            throw new Error(`删除草稿失败，错误码：${data.errcode}，${data.errmsg}`);
        }
        return data;
    } catch (error) {
        throw error;
    }
}

export async function deleteAllDrafts() {
    try {
        const accessToken = await fetchAccessToken();
        
        // 首先获取所有草稿
        let allDrafts = [];
        let offset = 0;
        const count = 20; // 每次获取20篇
        
        while (true) {
            const result = await getDraftList(offset, count);
            if (!result.item || result.item.length === 0) {
                break;
            }
            allDrafts.push(...result.item);
            offset += count;
            
            // 如果获取的数量少于请求数量，说明已经获取完所有草稿
            if (result.item.length < count) {
                break;
            }
        }
        
        if (allDrafts.length === 0) {
            return { deleted_count: 0, total_count: 0 };
        }
        
        // 删除所有草稿
        const deletePromises = allDrafts.map(async (draft) => {
            try {
                await deleteDraft(draft.media_id);
                return { success: true, media_id: draft.media_id };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, media_id: draft.media_id, error: errorMessage };
            }
        });
        
        const results = await Promise.all(deletePromises);
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        return {
            total_count: allDrafts.length,
            deleted_count: successful.length,
            failed_count: failed.length,
            failed_items: failed
        };
    } catch (error) {
        throw error;
    }
}
