(() => {
    // 确保在绑定事件之前检查元素是否存在
    const minimizeToTray = document.getElementById("minimizeToTray");
    const silentMode = document.getElementById("silentMode");
    const autoLaunch = document.getElementById("autoLaunch");
    const checkErrorsButton = document.getElementById("checkErrors");
    const openDataPathButton = document.getElementById("openDataPath");
    //硬件加速
    const hardwareAcceleration = document.getElementById("hardwareAcceleration");

    const getStarRailUrlButton = document.getElementById("getStarRailUrl");
    const getGenshinWishLinkButton = document.getElementById('getGenshinWishLink');

    const checkUpdateButton = document.getElementById("checkUpdate");
    const openUpdateLogButton = document.getElementById("openUpdateLog");

     // 处理背景图片选择
    const backgroundImageInput = document.getElementById("background-path");
    const backgroundOpacityInput = document.getElementById("backgroundOpacityInput");

    // 数据路径设置
    const dataFilePathInput = document.getElementById('dataFile-path');
    const browseButton = document.getElementById('browse-dataFile');
    const resetButton = document.getElementById('reset-dataFile');

    // 加载背景信息
    function loadBackgroundSettings() {
        window.electronAPI.invoke('loadBackgroundSettings').then(settings => {
            // 检查背景图片路径是否存在
            if (settings.backgroundImage === null) {
                document.getElementById('background-path').value = '没有设置背景图片';
            }else{
                // 如果有背景图片
                document.getElementById('background-path').value = settings.backgroundImage || '';
            }
            // 检查透明度设置是否存在
            if (settings.backgroundOpacity) {
                // 默认透明度值为0.5
                document.getElementById('backgroundOpacityInput').value = settings.backgroundOpacity || '0.5';
            }
            document.body.style.background = `linear-gradient(rgba(33, 33, 33, ${backgroundOpacityInput.value}), rgba(33, 33, 33, ${backgroundOpacityInput.value})), url('${window.electronAPI.filePathToURL(backgroundImageInput.value)}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundRepeat = "no-repeat";
            document.body.style.backgroundPosition = "center";
        }).catch(error => {
            console.error('加载背景设置失败:', error);
        });
    }
    loadBackgroundSettings();


    // 监听背景图片选择
    if (backgroundImageInput) {
        document.getElementById('browse-background').addEventListener('click', async () => {
            // 通过IPC发送选择文件夹的请求
            const result = await window.electronAPI.selectBackgroundFile();
            if (result.canceled === false && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                document.getElementById('background-path').value = filePath;
                // 可选择保存路径到数据库或直接应用
                await window.electronAPI.saveBackgroundSettings("backgroundImage", filePath);
                document.body.style.background = `linear-gradient(rgba(33, 33, 33, ${backgroundOpacityInput.value}), rgba(33, 33, 33, ${backgroundOpacityInput.value})), url('${window.electronAPI.filePathToURL(backgroundImageInput.value)}')`;
                document.body.style.backgroundSize = "cover";
                document.body.style.backgroundRepeat = "no-repeat";
                document.body.style.backgroundPosition = "center";
            }
        });
    }

    // 监听背景透明度变化
    if (backgroundOpacityInput) {
        backgroundOpacityInput.addEventListener("change", async (event) => {
            const opacity = event.target.value;
            await window.electronAPI.saveBackgroundSettings("backgroundOpacity", opacity);
        });
        backgroundOpacityInput.addEventListener("input", async (event) => {
            const opacity = event.target.value;
            // 更新背景样式
            document.body.style.background = `linear-gradient(rgba(33, 33, 33, ${opacity}), rgba(33, 33, 33, ${opacity})), url('${window.electronAPI.filePathToURL(backgroundImageInput.value)}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundRepeat = "no-repeat";
            document.body.style.backgroundPosition = "center";
        });
    }


    if (getStarRailUrlButton) {
        getStarRailUrlButton.addEventListener("click", async () => {
            const result = await window.electronAPI.invoke('getStarRailUrl');
            console.log(result);
            animationMessage(result.success, result.message);
        });
    }

    // 检查更新按钮
    if (checkUpdateButton) {
        checkUpdateButton.addEventListener("click", () => {
            animationMessage(true, "正在检查更新")
            // 发送检查更新事件到主进程
            window.electronAPI.send('check-for-updates');
        });
    }

    // 创建数据同步设置窗口
    document.getElementById('openDataSyncWindow').addEventListener('click', () => {
        window.electronAPI.send('openDataSyncWindow');
    });

    // 监听恢复默认配置按钮的点击事件
    document.getElementById('restore-defaults').addEventListener('click', () => {
        window.electronAPI.invoke('restoreDefaultBackgroundSettings')
            .then(() => {
                animationMessage(true, '背景设置已恢复为默认配置');
                // 更新配置
                loadBackgroundSettings();
            })
            .catch((err) => {
                console.error('恢复默认设置失败:', err);
                animationMessage(false, '恢复默认设置失败');
            });
    });
    document.getElementById('openCommonItems').addEventListener('click', async () => {
        try {
            await window.electronAPI.invoke('open-common-items');
        } catch (error) {
            console.error('打开 commonItems.json 出错:', error);
        }
    });


    // 更新日志按钮
    if (openUpdateLogButton) {
        openUpdateLogButton.addEventListener("click", () => {
            // 发送更新日志事件到主进程
            window.electronAPI.send('open-update-log');
        });
    }

    if (getGenshinWishLinkButton) {
        getGenshinWishLinkButton.addEventListener('click', async () => {
            const result = await window.electronAPI.invoke('getGenshinWishLink');
            if(result.success){
                animationMessage(result.success, `原神祈愿链接获取成功, 已复制到剪贴板\n${result.message}`);
            }else{
                animationMessage(result.success, `原神祈愿链接获取失败\n${result.message}`);
            }
        });
    }

    if (minimizeToTray && silentMode && autoLaunch && hardwareAcceleration) {
        window.electronAPI.invoke("load-settings").then(settings => {
            minimizeToTray.checked = settings.minimizeToTray === "true";
            silentMode.checked = settings.silentMode === "true";
            autoLaunch.checked = settings.autoLaunch === "true";
            hardwareAcceleration.checked = settings.hardwareAcceleration === "true"; // 加入硬件加速的状态加载
        });
    }

    // 监听设置变化并保存
    [minimizeToTray, silentMode, autoLaunch, hardwareAcceleration].forEach(setting => {
        if (setting) {
            setting.addEventListener("click", () => {
                // 调用 save-setting IPC 方法保存设置
                window.electronAPI.invoke("save-setting", setting.id, setting.checked.toString()).then(() => {
                    if (setting.id === "autoLaunch") {
                        window.electronAPI.setAutoLaunch(setting.checked);
                    }
                    if (setting.id === "hardwareAcceleration") {
                        animationMessage(true, "硬件加速设置已更改，需要重启应用生效。");
                    }
                }).catch(err => {
                    animationMessage(false, `保存设置错误 ${setting.id}:`);
                    console.error(`保存设置错误 ${setting.id}:`, err);
                });
            });
        }
    });


    // 检查错误数据并显示反馈
    if (checkErrorsButton) {
        checkErrorsButton.addEventListener("click", () => {
            console.log("检查错误数据");
            window.electronAPI.checkErrors().then(result => {
                if (result) {
                    animationMessage(true, `${result}`);
                } else {
                    animationMessage(true, "所有数据正常");
                }

            }).catch(err => {
                animationMessage(false,`检查错误时发生问题${err}`);
            });
        });
    }

    // 打开数据文件夹
    if (openDataPathButton) {
        openDataPathButton.addEventListener("click", () => {
            window.electronAPI.openDataPath();
        });
    }
    // 检查外部链接
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = e.currentTarget.href;
            window.electronAPI.openExternal(url);
        });
    });

    // 加载当前路径
    async function loadDataPath() {
        const result = await window.electronAPI.invoke('get-dataFile-path');
        if (result.path) {
            dataFilePathInput.value = result.path;
        }
    }

    // 选择自定义数据路径
    browseButton.addEventListener('click', async () => {
        browseButton.disabled = true;
        browseButton.innerText = '请等待...';
        try {
            const result = await window.electronAPI.invoke('browse-dataFile');
            if (result.success) {
                animationMessage(true, `路径相同: ${result.path}`);
                dataFilePathInput.value = result.path;
            } else {
                animationMessage(false, result.message);
            }
        } catch (error) {
            console.error('切换路径时发生错误:', error);
            animationMessage(false, `路径更新失败\n${error}`);
        }finally {
            browseButton.disabled = false;
            browseButton.innerText = '更新数据路径';
        }
    });

    // 恢复默认数据路径
    resetButton.addEventListener('click', async () => {
        resetButton.disabled = true;
        resetButton.innerText = '请等待...';
        try {
            const result = await window.electronAPI.invoke('reset-dataFile');
            if (result.success) {
                animationMessage(true, '目前已是默认路径');
                dataFilePathInput.value = result.path;
            } else {
                animationMessage(false, result.message);
            }
        } catch (error) {
            console.error('恢复路径时发生错误:', error);
            animationMessage(false, `重置路径失败\n${error}`);
        }finally {
            resetButton.disabled = false;
            resetButton.innerText = '恢复默认路径';
        }
    });

    const customPathInput = document.getElementById("custom-path");
    const savePathButton = document.getElementById("save-path");
    const resetPathButton = document.getElementById("reset-path");

    // 初始化加载自定义路径
    const loadCustomPath = async () => {
        const customPath = await window.electronAPI.invoke("get-custom-path");
        customPathInput.value = customPath || ""; // 如果没有配置，则显示为空
    };

    // 保存自定义路径
    savePathButton.addEventListener("click", async () => {
        const customPath = customPathInput.value.trim();

        if (!customPath) {
            animationMessage(false, "自定义路径不能为空！");
            return;
        }

        await window.electronAPI.invoke("set-custom-path", customPath);
        animationMessage(true, "自定义路径已保存！");
    });

    // 恢复默认路径
    resetPathButton.addEventListener("click", async () => {
        await window.electronAPI.invoke("reset-custom-path");
        animationMessage(true, "已恢复默认源！");
        loadCustomPath();
    });

    // 初始化
    loadCustomPath();
    // 初始化加载路径
    loadDataPath();

    /* ---------------- 米游社账号 ---------------- */
    const mhyInfo = document.getElementById('mhyAccountInfo');
    const mhyRoles = document.getElementById('mhyRoles');
    const mhyLoginBtn = document.getElementById('mhyLoginBtn');
    const mhyLogoutBtn = document.getElementById('mhyLogoutBtn');
    const mhyRefreshBtn = document.getElementById('mhyRefreshBtn');
    const mhyTestBtn = document.getElementById('mhyTestBtn');
    const qrOverlay = document.getElementById('mhyQrOverlay');
    const qrImage = document.getElementById('mhyQrImage');
    const qrStatus = document.getElementById('mhyQrStatus');
    const qrCancel = document.getElementById('mhyQrCancel');

    let qrTimer = null;

    function renderAccount(info) {
        if (!info || !info.loggedIn) {
            mhyInfo.innerHTML = `未登录米游社账号${info && info.message ? `<br><span style="color:#c66">${info.message}</span>` : ''}`;
            mhyRoles.innerHTML = '';
            mhyLogoutBtn.style.display = 'none';
            return;
        }
        mhyLogoutBtn.style.display = '';
        mhyInfo.innerHTML = `已登录：<b>${info.nickname || info.accountId}</b>（米游社 UID ${info.accountId}）<br>登录时间 ${info.updated || '未知'}`;

        let html = '';
        for (const [key, g] of Object.entries(info.games || {})) {
            const flag = g.cookieSupported
                ? '<span style="color:#6c6">支持免启动游戏</span>'
                : '<span style="color:#c96">接口限制，走游戏缓存</span>';
            html += `<div style="margin:10px 0;">
                <div><b>${g.label}</b> ${flag}</div>`;
            if (!g.candidates.length) {
                html += `<div class="help-text" style="margin:2px 0;">账号下没有该游戏角色</div>`;
            } else {
                g.candidates.forEach((c) => {
                    // ipc.js 里 candidates 的字段是 uid / region / regionName / level，不是 gameUid
                    html += `<div class="help-text" style="margin:2px 0;">
                        UID ${c.uid} · ${c.regionName}（${c.region}）· Lv.${c.level}
                        <button data-game="${key}" data-uid="${c.uid}" class="mhy-pick" style="margin-left:8px;padding:2px 10px;border:none;border-radius:4px;cursor:pointer;">选用</button>
                    </div>`;
                });
            }
            html += `</div>`;
        }
        mhyRoles.innerHTML = html;
        mhyRoles.querySelectorAll('.mhy-pick').forEach((btn) => {
            btn.addEventListener('click', async () => {
                await window.electronAPI.invoke('mhy-set-preferred-uid', btn.dataset.game, btn.dataset.uid);
                animationMessage(true, `${btn.dataset.game} 已选用 UID ${btn.dataset.uid}`);
                await refreshAccount();
            });
        });
    }

    async function refreshAccount() {
        try {
            const info = await window.electronAPI.invoke('mhy-account-info');
            renderAccount(info);
        } catch (e) {
            renderAccount(null);
        }
    }

    function stopQr() {
        if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
        qrOverlay.style.display = 'none';
    }

    async function startQr() {
        qrOverlay.style.display = 'flex';
        qrStatus.textContent = '正在生成二维码...';
        const created = await window.electronAPI.invoke('mhy-login-create-qr');
        if (!created.success) {
            qrStatus.textContent = `创建二维码失败：${created.message}`;
            return;
        }
        qrImage.src = created.qrDataUrl;
        qrStatus.textContent = '等待扫码...';

        let expiredOnce = false;
        const poll = async () => {
            try {
                const r = await window.electronAPI.invoke('mhy-login-poll', created.ticket);
                if (!r.success) {
                    if (r.expired && !expiredOnce) {
                        expiredOnce = true;
                        qrStatus.textContent = '二维码已过期，重新生成...';
                        stopQr();
                        await startQr();
                        return;
                    }
                    qrStatus.textContent = `查询失败：${r.message}`;
                    return;
                }
                if (r.status === 'Scanned') qrStatus.textContent = '已扫码，请在手机上确认...';
                if (r.status === 'Confirmed') {
                    stopQr();
                    animationMessage(true, `登录成功：${r.nickname || r.accountId}`);
                    await refreshAccount();
                }
            } catch (e) {
                qrStatus.textContent = `轮询异常：${e}`;
            }
        };
        if (qrTimer) clearInterval(qrTimer);
        qrTimer = setInterval(poll, 1500);
        poll();
    }

    if (mhyLoginBtn) mhyLoginBtn.addEventListener('click', startQr);
    if (qrCancel) qrCancel.addEventListener('click', stopQr);
    if (mhyRefreshBtn) mhyRefreshBtn.addEventListener('click', refreshAccount);

    if (mhyLogoutBtn) {
        mhyLogoutBtn.addEventListener('click', async () => {
            await window.electronAPI.invoke('mhy-logout');
            animationMessage(true, '已退出米游社账号');
            await refreshAccount();
        });
    }

    if (mhyTestBtn) {
        mhyTestBtn.addEventListener('click', async () => {
            mhyTestBtn.disabled = true;
            const keys = ['genshin', 'miliastra', 'zzz', 'starrail'];
            const lines = [];
            for (const k of keys) {
                const r = await window.electronAPI.invoke('mhy-test-gacha', k);
                lines.push(`${r.game}: ${r.success ? '成功' : '失败'} [${r.step}] ${r.message || ''}${r.count !== undefined ? ` 条数=${r.count}` : ''}`);
            }
            animationMessage(true, lines.join('\n'));
            mhyTestBtn.disabled = false;
        });
    }

    refreshAccount();

})();
