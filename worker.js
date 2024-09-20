//Past Worker Genenated Script Below This


// Access Token
async function fetchAccessToken() {
    try {
        const post_data = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });

        const response = await fetch('https://www.googleapis.com/oauth2/v4/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: post_data.toString(),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        const accessToken = data.access_token;

        return accessToken;
    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}

//Listener For Request or Download
addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (url.pathname === '/') {
        event.respondWith(handleRootRequest(request));
    } else if (url.pathname.startsWith("/download/")) {
        event.respondWith(handleDownload(request));
    } else {
        event.respondWith(handleRequest(request));
    }
});

//Handle Requests
async function handleRequest(request) {
    try {
        const accessToken = await fetchAccessToken();
        const url = new URL(request.url);
        const path = url.pathname;
        const cleanPath = path.replace(/^\/+|\/+$/g, '');
        const pathSegments = cleanPath.split('/');

        let currentParentId = homePathId;

        for (const segment of pathSegments) {
            const folder = await getFolderByName(accessToken, currentParentId, segment);

            if (folder) {
                currentParentId = folder.id;
            } else {
                return new Response("Resource not found", { status: 404 });
            }
        }

        const driveItems = await fetchDriveItems(accessToken, `'${currentParentId}' in parents and trashed=false`);
        const response = new Response(JSON.stringify(driveItems), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response;
    } catch (error) {
        console.error("Error:", error.message);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}

//Get Folder Items
async function getFolderByName(accessToken, parentId, folderName) {
    try {
        folderName = decodeURIComponent(folderName);
        const body_Get = new URLSearchParams();
        // @ts-ignore
        if (homePathId === "root") {
            // If homePathId is set to "root," use 'root' as the parent ID for MyDrive.
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${folderName}'`);
            body_Get.set("fields", "files(id, name, mimeType)");
        } else {
            // Use the specified homePathId for Shared Drive.
            body_Get.set("corpora", "drive");
            body_Get.set("driveId", homePathId);
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${folderName}'`);
            body_Get.set("fields", "files(id, name, size, mimeType)");
        }
        

        const response = await fetch(`${driveApiUrl}?${body_Get.toString()}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (data.files.length > 0) {
            return data.files[0];
            console.log ("Data")
        } else {
          console.log ("no data")
            return null;
        }
    } catch (error) {
        console.error("Error fetching folder:", error);
        throw error;
    }
}

//Fetch Drive Items
async function fetchDriveItems(accessToken, query, pageToken = '') {
    try {
        const body_Get = new URLSearchParams();
        // @ts-ignore
        if (homePathId === "root") {
            // If homePathId is set to "root," use 'root' as the parent ID for MyDrive.
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", query);
            body_Get.set("fields", "files(id, name, size, mimeType),nextPageToken");
            body_Get.set("pageToken", pageToken); 
        } else {
            // Use the specified homePathId for Shared Drive.
            body_Get.set("corpora", "drive");
            body_Get.set("driveId", homePathId);
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", query);
            body_Get.set("fields", "files(id, name, size, mimeType),nextPageToken");
            body_Get.set("pageToken", pageToken); 
        }

        const response = await fetch(`${driveApiUrl}?${body_Get.toString()}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Check if nextPageToken is present in the response
        const nextPageToken = data.nextPageToken;

        if (nextPageToken) {
            // Make a recursive call to fetch the next page of data
            const nextPageData = await fetchDriveItems(accessToken, query, nextPageToken);
            return [...data.files, ...nextPageData];
        } else {
            return data.files;
        }
    } catch (error) {
        console.error("Error fetching Drive items:", error);
        throw error;
    }
}

//Download Request Or Stream Request with Range Support
async function handleDownload(request) {
    try {
        const accessToken = await fetchAccessToken();
        const url = new URL(request.url);
        const path = url.pathname;
        const decodedPath = decodeURIComponent(path);
        const filename = decodedPath.split('/').pop();
        const query = `trashed=false and name='${filename}'`;
        const fileMetadata = await fetchDriveItems(accessToken, query);
        if (fileMetadata.length === 0) {
            return new Response("File not found", { status: 404 });
        }

        const fileId = fileMetadata[0].id;
        const streamUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

        // Check if the request has a Range header
        const range = request.headers.get('Range');
        const streamRequestHeaders = {
            Authorization: `Bearer ${accessToken}`,
        };

        if (range) {
            streamRequestHeaders['Range'] = range;  // Include Range header in the request
        }

        const streamRequest = new Request(streamUrl, {
            headers: streamRequestHeaders,
        });

        const fileResponse = await fetch(streamRequest);

        // If the response includes a 'Content-Range' header, we assume it's a partial response for range requests
        const statusCode = fileResponse.status === 206 ? 206 : 200;  // 206 = Partial Content, 200 = OK
        const contentRange = fileResponse.headers.get('Content-Range') || '';
        const contentType = fileResponse.headers.get('Content-Type') || 'application/octet-stream';

        return new Response(fileResponse.body, {
            status: statusCode,
            headers: {
                'Content-Type': contentType,
                'Content-Range': contentRange,  // Pass through the Content-Range header if present
                'Accept-Ranges': 'bytes',  // Let the client know the server supports range requests
                'Content-Disposition': 'inline',  // Ensure inline streaming
            },
        });
    } catch (error) {
        console.error("Error streaming file:", error);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}

//Root Url Request
async function handleRootRequest(request) {
    try {
        const accessToken = await fetchAccessToken();
        let driveItems;
        // @ts-ignore        
        if (homePathId === "root") {
            // Handle requests for MyDrive
            driveItems = await fetchDriveItems(accessToken, `'root' in parents and trashed=false`);
        } else {
            // Handle requests for the specified Shared Drive
            driveItems = await fetchDriveItems(accessToken, `'${homePathId}' in parents and trashed=false`);
        }

        const response = new Response(JSON.stringify(driveItems), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response;
    } catch (error) {
        console.error("Error:", error.message);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}

//Past Worker Genenated Script Above This

// Access Token
async function fetchAccessToken() {
    try {
        const post_data = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });

        const response = await fetch('https://www.googleapis.com/oauth2/v4/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: post_data.toString(),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        const accessToken = data.access_token;

        return accessToken;
    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}

//Listener For Request or Download
addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (url.pathname === '/') {
        event.respondWith(handleRootRequest(request));
    } else if (url.pathname.startsWith("/download/")) {
        event.respondWith(handleDownload(request));
    } else {
        event.respondWith(handleRequest(request));
    }
});

//Handle Requests
async function handleRequest(request) {
    try {
        const accessToken = await fetchAccessToken();
        const url = new URL(request.url);
        const path = url.pathname;
        const cleanPath = path.replace(/^\/+|\/+$/g, '');
        const pathSegments = cleanPath.split('/');

        let currentParentId = homePathId;

        for (const segment of pathSegments) {
            const folder = await getFolderByName(accessToken, currentParentId, segment);

            if (folder) {
                currentParentId = folder.id;
            } else {
                return new Response("Resource not found", { status: 404 });
            }
        }

        const driveItems = await fetchDriveItems(accessToken, `'${currentParentId}' in parents and trashed=false`);
        const response = new Response(JSON.stringify(driveItems), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response;
    } catch (error) {
        console.error("Error:", error.message);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}

//Get Folder Items
async function getFolderByName(accessToken, parentId, folderName) {
    try {
        folderName = decodeURIComponent(folderName);
        const body_Get = new URLSearchParams();
        // @ts-ignore
        if (homePathId === "root") {
            // If homePathId is set to "root," use 'root' as the parent ID for MyDrive.
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${folderName}'`);
            body_Get.set("fields", "files(id, name, mimeType)");
        } else {
            // Use the specified homePathId for Shared Drive.
            body_Get.set("corpora", "drive");
            body_Get.set("driveId", homePathId);
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", `'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${folderName}'`);
            body_Get.set("fields", "files(id, name, size, mimeType)");
        }
        

        const response = await fetch(`${driveApiUrl}?${body_Get.toString()}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (data.files.length > 0) {
            return data.files[0];
            console.log ("Data")
        } else {
          console.log ("no data")
            return null;
        }
    } catch (error) {
        console.error("Error fetching folder:", error);
        throw error;
    }
}

//Fetch Drive Items
async function fetchDriveItems(accessToken, query, pageToken = '') {
    try {
        const body_Get = new URLSearchParams();
        // @ts-ignore
        if (homePathId === "root") {
            // If homePathId is set to "root," use 'root' as the parent ID for MyDrive.
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", query);
            body_Get.set("fields", "files(id, name, size, mimeType),nextPageToken");
            body_Get.set("pageToken", pageToken); 
        } else {
            // Use the specified homePathId for Shared Drive.
            body_Get.set("corpora", "drive");
            body_Get.set("driveId", homePathId);
            body_Get.set("includeItemsFromAllDrives", "true");
            body_Get.set("supportsAllDrives", "true");
            body_Get.set("q", query);
            body_Get.set("fields", "files(id, name, size, mimeType),nextPageToken");
            body_Get.set("pageToken", pageToken); 
        }

        const response = await fetch(`${driveApiUrl}?${body_Get.toString()}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Check if nextPageToken is present in the response
        const nextPageToken = data.nextPageToken;

        if (nextPageToken) {
            // Make a recursive call to fetch the next page of data
            const nextPageData = await fetchDriveItems(accessToken, query, nextPageToken);
            return [...data.files, ...nextPageData];
        } else {
            return data.files;
        }
    } catch (error) {
        console.error("Error fetching Drive items:", error);
        throw error;
    }
}

//Download Request
async function handleDownload(request) {
    try {
        const accessToken = await fetchAccessToken();
        const url = new URL(request.url);
        const path = url.pathname;
        const decodedPath = decodeURIComponent(path);
        const filename = decodedPath.split('/').pop();
        const query = `trashed=false and name='${filename}'`;
        const fileMetadata = await fetchDriveItems(accessToken, query);
        if (fileMetadata.length === 0) {
            return new Response("File not found", { status: 404 });
        }
        
        const fileId = fileMetadata[0].id;
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        
        const downloadRequest = new Request(downloadUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        
        const fileResponse = await fetch(downloadRequest);
        
        return new Response(fileResponse.body, {
            status: fileResponse.status,
            statusText: fileResponse.statusText,
            headers: {
                'Content-Type': fileResponse.headers.get('Content-Type'),
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("Error downloading file:", error);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}

//Root Url Request
async function handleRootRequest(request) {
    try {
        const accessToken = await fetchAccessToken();
        let driveItems;
        // @ts-ignore        
        if (homePathId === "root") {
            // Handle requests for MyDrive
            driveItems = await fetchDriveItems(accessToken, `'root' in parents and trashed=false`);
        } else {
            // Handle requests for the specified Shared Drive
            driveItems = await fetchDriveItems(accessToken, `'${homePathId}' in parents and trashed=false`);
        }

        const response = new Response(JSON.stringify(driveItems), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return response;
    } catch (error) {
        console.error("Error:", error.message);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
} can you update this
