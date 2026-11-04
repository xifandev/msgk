-- ============================================================================
-- MSGK 旧库（Laravel 版）→ 新库（Nuxt 版）数据迁移脚本
-- 目标：MySQL 8.0+，新库为全新导入 database/schema.sql 后的状态
-- 本脚本只读旧库、只写新库业务表，不修改表结构。
-- ============================================================================
--
-- 【执行前提】（务必逐条确认后再执行）
--   1. 新库已完整导入 database/schema.sql（含种子角色 roles 1/2/3/999 与默认
--      超管 admins.phone='15224499331'），除种子数据外业务表为空。
--   2. 旧库与新库在同一 MySQL 实例中，旧库名为 msgk_legacy；若不同，请全文
--      替换 "msgk_legacy." 为实际库名（本文件仅此处出现库名前缀）。
--   3. 执行前 USE 到新库，即：USE <新库名>; 之后再 source 本文件。
--   4. 必须在同一会话内一次性执行（mysql 客户端 source 本文件即可），因为
--      依赖临时表 tmp_admin_map 与会话变量 @admin_id_offset。
--   5. MySQL 8.0.19+（使用 JSON_TABLE / 窗口函数），两库均为 utf8mb4。
--
-- 【备份提醒】（重要）
--   执行前请备份两个库，例如：
--     mysqldump -u root -p <新库名> > newdb_before_migrate.sql
--     mysqldump -u root -p msgk_legacy > msgk_legacy_backup.sql
--   建议先在测试实例上用备份还原后演练一次，确认第 9 节校验输出无误后再到
--   正式库执行。脚本整体在一个事务中，任一步报错请 ROLLBACK 后排查。
--
-- 【明确不迁移的内容】
--   - 旧 admin 表的 password / openid / code / code_time / qids / wuye /
--     shequ 列（新系统使用短信验证码登录，无密码与 openid 概念）。
--   - 旧物业相关表与数据（xiaoqu、user、menu、role.rights、shijian 等），
--     新系统无对应模块。
--   - 旧 changsuo 已删除场所遗留在 renyuan/zhangdan/mingxi 等表中的孤儿
--     数据（通过 JOIN venues 自动跳过，见第 8 节自检）。
--   - 旧 log 表主键（旧代码中未出现主键列名，无法确认；日志按自增 id
--     重新编号，时间与操作者保持不变）。
--
-- 【关键映射约定】
--   状态（jieshao/renyuan/anquan/zhangdan 共用）：
--     正在编辑→draft  待镇级审核→pending_town  待县级审核→pending_county
--     审核通过→approved  审核失败→rejected  其他/NULL→draft（需人工复查）
--   公开开关：kaiguan=1 → published=1，其余→0（旧小程序查询条件为
--     state='审核通过' AND kaiguan=1，与新库 state='approved' AND
--     published=1 语义一致）。
--   角色：旧 admin.rid 1/2/3/999 → 新 roles.id 1/2/3/999；rid 为 1 或 999
--     的账号 all_venues=1。旧系统允许自定义角色，rid 非 1/2/3/999 的账号
--     一律落入 role_id=3（场所管理员）占位，并在第 8 节列出清单，必须人工
--     逐个改派角色，不要视为已正确映射。
--   金额：旧 mingxi.jine、zhangdan.shouru/zhichu/shangyue_jieyu/
--     benyue_jieyu 按 DECIMAL(14,2) 转换，空值或 NaN 等无法识别的结余按 0 处理。
--   日期：旧库时间列多为字符串，凡匹配 YYYY-MM-DD[ hh:mm:ss] 前缀的转为
--     DATETIME/DATE，空串/NULL/无法识别的一律置 NULL（created_at 除外，
--     置 NULL 会破坏审计，改用 NOW() 或账单月首日兜底并注明）。
-- ============================================================================

SET NAMES utf8mb4;

-- ============================================================================
-- 第 0 节：执行前自检（以下语句为只读检查，建议先逐条执行确认，默认注释掉；
-- 如有输出请先处理脏数据或调整本脚本映射，再继续）
-- ============================================================================
-- 0.1 状态值应只出现五种中文状态，出现其他值请先核对映射：
--   SELECT state, COUNT(*) FROM msgk_legacy.jieshao  GROUP BY state;
--   SELECT state, COUNT(*) FROM msgk_legacy.renyuan  GROUP BY state;
--   SELECT state, COUNT(*) FROM msgk_legacy.anquan   GROUP BY state;
--   SELECT state, COUNT(*) FROM msgk_legacy.zhangdan GROUP BY state;
-- 0.2 旧 admin.name（手机号）应唯一，有重复时本脚本只保留 aid 最小的一条：
--   SELECT name, COUNT(*) c FROM msgk_legacy.admin GROUP BY name HAVING c > 1;
-- 0.3 角色分布，确认是否存在 1/2/3/999 之外的自定义 rid（需人工改派）：
--   SELECT rid, COUNT(*) FROM msgk_legacy.admin GROUP BY rid;
-- 0.4 同一场所多条介绍/人员记录时，本脚本只保留主键最小的一条（与旧后台
--     ->first() 行为一致），请确认其余为冗余数据：
--   SELECT cid, COUNT(*) c FROM msgk_legacy.jieshao GROUP BY cid HAVING c > 1;
--   SELECT cid, COUNT(*) c FROM msgk_legacy.renyuan GROUP BY cid HAVING c > 1;
-- 0.5 新闻分类重名会违反新库唯一约束，需先在旧库去重：
--   SELECT name, COUNT(*) c FROM msgk_legacy.news_type GROUP BY name HAVING c > 1;
-- 0.6 孤儿数据（所属场所已删除，将被跳过）：
--   SELECT COUNT(*) FROM msgk_legacy.renyuan  r LEFT JOIN msgk_legacy.changsuo c ON c.cid=r.cid WHERE c.cid IS NULL;
--   SELECT COUNT(*) FROM msgk_legacy.zhangdan z LEFT JOIN msgk_legacy.changsuo c ON c.cid=z.cid WHERE c.cid IS NULL;
--   SELECT COUNT(*) FROM msgk_legacy.mingxi   m LEFT JOIN msgk_legacy.changsuo c ON c.cid=m.cid WHERE c.cid IS NULL;
-- 0.7 明细收支类型应为 收入/支出，其他值将被跳过（见 6.2）：
--   SELECT type, COUNT(*) FROM msgk_legacy.mingxi GROUP BY type;
-- 0.8 找不到对应账单的明细（按 cid+年月匹配，见 6.2，将被跳过）：
--   SELECT COUNT(*) FROM msgk_legacy.mingxi m
--     LEFT JOIN msgk_legacy.zhangdan z
--       ON z.cid = m.cid AND LEFT(z.time,7) = LEFT(m.time,7)
--   WHERE z.zid IS NULL;

START TRANSACTION;

-- ============================================================================
-- 第 1 节：场所 changsuo → venues（保留旧主键 cid → id）
-- 说明：旧二维码 path 中的 cid 与新库 id 相同，旧海报可继续扫码使用；
-- changsuo.code 只是旧服务器上的图片路径，新后台改为实时向微信取码，不再迁移。
-- 旧表无图片字段，image_url 置 NULL。
-- ============================================================================
INSERT INTO venues (id, name, township, sort_order, image_url, safety_note, created_at)
SELECT
  c.cid,
  c.name,
  COALESCE(NULLIF(c.xiangzhen, ''), '未分类'),
  COALESCE(c.xuhao, 0),
  NULL,
  NULL,
  CASE WHEN c.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(c.time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.changsuo c;

-- ============================================================================
-- 第 2 节：管理员 admin → admins
-- 列映射：name(手机号)→phone、myname→name、rid→role_id、danwei→organization、
-- other→note、status(200 启用)→status(1/0)、cids(JSON)→venue_ids、
-- notice_enabled 默认启用、last_login_time→last_login_at。
-- 主键处理：新库种子超管已占用 id=1，与旧 aid=1 冲突，分三步处理：
--   A. 手机号已存在于新库的账号：不重复插入，旧 aid 映射到现有 id；
--   B. 旧 aid 未被占用的：保留旧主键插入；
--   C. 旧 aid 被占用但手机号不冲突的：整体平移到 max(id) 之后。
-- 说明：旧表无注册时间，created_at 统一为迁移时间；如旧表缺少
-- tongzhi/last_login_time/other/danwei 等列，请按实际情况删除对应表达式。
-- ============================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_admin_map;
CREATE TEMPORARY TABLE tmp_admin_map (
  old_aid BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  new_id BIGINT UNSIGNED NOT NULL
) ENGINE = MEMORY;

-- 2.A 手机号已存在（含种子超管）：只建映射，不插入
INSERT INTO tmp_admin_map (old_aid, new_id)
SELECT a.aid, n.id
FROM msgk_legacy.admin a
JOIN admins n ON n.phone = a.name COLLATE utf8mb4_unicode_ci;

-- 2.B 保留旧主键插入（aid 未冲突、手机号未迁移过；同手机号多条取 aid 最小者）
INSERT INTO admins (id, phone, name, role_id, organization, note, status,
                    all_venues, venue_ids, notice_enabled, last_login_at, created_at)
SELECT
  a.aid,
  a.name,
  COALESCE(NULLIF(a.myname, ''), a.name),
  CASE a.rid WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 999 THEN 999 ELSE 3 END,
  NULLIF(a.danwei, ''),
  NULLIF(a.other, ''),
  CASE WHEN CAST(a.status AS UNSIGNED) IN (1, 200) THEN 1 ELSE 0 END,
  CASE WHEN a.rid IN (1, 999) THEN 1 ELSE 0 END,
  CASE WHEN JSON_VALID(a.cids) THEN a.cids ELSE JSON_ARRAY() END,
  1,
  CASE WHEN a.last_login_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.last_login_time AS DATETIME) ELSE NULL END,
  NOW()
FROM (
  SELECT t.*, MIN(t.aid) OVER (PARTITION BY t.name) AS min_aid_per_phone
  FROM msgk_legacy.admin t
) a
WHERE a.aid = a.min_aid_per_phone
  AND NOT EXISTS (SELECT 1 FROM (SELECT old_aid FROM tmp_admin_map) AS m WHERE m.old_aid = a.aid)
  AND NOT EXISTS (SELECT 1 FROM admins n WHERE n.id = a.aid)
  AND NOT EXISTS (SELECT 1 FROM admins n WHERE n.phone = a.name COLLATE utf8mb4_unicode_ci);

-- 2.B 映射补齐
INSERT IGNORE INTO tmp_admin_map (old_aid, new_id)
SELECT a.aid, n.id
FROM msgk_legacy.admin a
JOIN admins n ON n.phone = a.name COLLATE utf8mb4_unicode_ci;

-- 2.C 主键冲突（典型：旧 aid=1 与种子超管）且手机号未迁移的账号，平移主键
SET @admin_id_offset := GREATEST(
  COALESCE((SELECT MAX(id) FROM admins), 0),
  COALESCE((SELECT MAX(aid) FROM msgk_legacy.admin), 0)
);

INSERT INTO admins (id, phone, name, role_id, organization, note, status,
                    all_venues, venue_ids, notice_enabled, last_login_at, created_at)
SELECT
  @admin_id_offset + a.aid,
  a.name,
  COALESCE(NULLIF(a.myname, ''), a.name),
  CASE a.rid WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 3 WHEN 999 THEN 999 ELSE 3 END,
  NULLIF(a.danwei, ''),
  NULLIF(a.other, ''),
  CASE WHEN CAST(a.status AS UNSIGNED) IN (1, 200) THEN 1 ELSE 0 END,
  CASE WHEN a.rid IN (1, 999) THEN 1 ELSE 0 END,
  CASE WHEN JSON_VALID(a.cids) THEN a.cids ELSE JSON_ARRAY() END,
  1,
  CASE WHEN a.last_login_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.last_login_time AS DATETIME) ELSE NULL END,
  NOW()
FROM (
  SELECT t.*, MIN(t.aid) OVER (PARTITION BY t.name) AS min_aid_per_phone
  FROM msgk_legacy.admin t
) a
WHERE a.aid = a.min_aid_per_phone
  AND NOT EXISTS (SELECT 1 FROM (SELECT old_aid FROM tmp_admin_map) AS m WHERE m.old_aid = a.aid);

INSERT IGNORE INTO tmp_admin_map (old_aid, new_id)
SELECT a.aid, @admin_id_offset + a.aid
FROM msgk_legacy.admin a;

-- ============================================================================
-- 第 3 节：场所介绍 jieshao → venue_profiles（保留 jid → id）
-- neirong 为 [{mingcheng, neirong}, ...] 数组，转成新 extra 扁平对象
-- {"名称": "内容", ...}；同名条目保留其一（旧数据无去重约束，取最后出现的
-- 内容近似，需人工抽查）。jianzao_time/mianji 旧代码已停用，不迁移；
-- 如旧库仍有有效值，可人工补录到 extra。
-- 时间列：旧库无创建时间，created_at/updated_at 用默认值（迁移时刻）。
-- ============================================================================
INSERT INTO venue_profiles (
  id, venue_id, registration_date, religion, category, manager, phone,
  approval_authority, credit_code, address, summary, extra,
  state, published, submitted_at, town_note, town_reviewed_at,
  county_note, county_reviewed_at, created_by, updated_by
)
SELECT
  j.jid,
  j.cid,
  CASE WHEN j.dengji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN DATE(j.dengji_time) ELSE NULL END,
  NULLIF(j.zongjiao, ''),
  NULLIF(j.leibie, ''),
  NULLIF(j.fuzeren, ''),
  NULLIF(LEFT(j.tel, 30), ''),
  NULLIF(j.pizhun, ''),
  NULLIF(j.daima, ''),
  NULLIF(j.dizhi, ''),
  NULLIF(j.jianjie, ''),
  COALESCE((
    SELECT JSON_OBJECTAGG(t.mingcheng, t.neirong)
    FROM (
      SELECT jt.mingcheng, MAX(jt.neirong) AS neirong
      FROM JSON_TABLE(
        CASE WHEN JSON_VALID(j.neirong) THEN j.neirong ELSE '[]' END,
        '$[*]' COLUMNS (
          mingcheng VARCHAR(200) PATH '$.mingcheng',
          neirong   TEXT         PATH '$.neirong'
        )
      ) jt
      WHERE jt.mingcheng IS NOT NULL AND jt.mingcheng <> ''
      GROUP BY jt.mingcheng
    ) t
  ), JSON_OBJECT()),
  CASE j.state
    WHEN '正在编辑'   THEN 'draft'
    WHEN '待镇级审核' THEN 'pending_town'
    WHEN '待县级审核' THEN 'pending_county'
    WHEN '审核通过'   THEN 'approved'
    WHEN '审核失败'   THEN 'rejected'
    ELSE 'draft'
  END,
  CASE WHEN CAST(j.kaiguan AS UNSIGNED) = 1 THEN 1 ELSE 0 END,
  CASE WHEN j.tijiao_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(j.tijiao_time AS DATETIME) ELSE NULL END,
  NULLIF(j.zhenji, ''),
  CASE WHEN j.zhenji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(j.zhenji_time AS DATETIME) ELSE NULL END,
  NULLIF(j.xianji, ''),
  CASE WHEN j.xianji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(j.xianji_time AS DATETIME) ELSE NULL END,
  NULL,
  NULL
FROM msgk_legacy.jieshao j
JOIN venues v ON v.id = j.cid
-- venue_id 有唯一约束：同一场所多条介绍时保留 jid 最小者（与旧后台
-- ->first() 取数行为一致），其余视为冗余跳过，请先按 0.4 自检确认。
WHERE NOT EXISTS (
  SELECT 1 FROM msgk_legacy.jieshao j2 WHERE j2.cid = j.cid AND j2.jid < j.jid
);

-- ============================================================================
-- 第 4 节：人员 renyuan → personnel（保留 rid → id）
-- neirong 数组字段映射：img→imageUrl、xingming→name、xingbie→gender、
-- jiaozhi→clergy、zhiwu→position、tel→phone、paixu→sort。
-- ============================================================================
INSERT INTO personnel (
  id, venue_id, members, state, published, submitted_at,
  town_note, town_reviewed_at, county_note, county_reviewed_at,
  created_by, updated_by
)
SELECT
  r.rid,
  r.cid,
  COALESCE((
    SELECT JSON_ARRAYAGG(
      JSON_OBJECT(
        'sort',     COALESCE(CAST(NULLIF(jt.paixu, '') AS UNSIGNED), 0),
        'imageUrl', NULLIF(jt.img, ''),
        'name',     COALESCE(jt.xingming, ''),
        'gender',   COALESCE(jt.xingbie, ''),
        'clergy',   COALESCE(jt.jiaozhi, ''),
        'position', COALESCE(jt.zhiwu, ''),
        'phone',    COALESCE(jt.tel, '')
      )
    )
    FROM JSON_TABLE(
      CASE WHEN JSON_VALID(r.neirong) THEN r.neirong ELSE '[]' END,
      '$[*]' COLUMNS (
        img      VARCHAR(500) PATH '$.img',
        xingming VARCHAR(100) PATH '$.xingming',
        xingbie  VARCHAR(20)  PATH '$.xingbie',
        jiaozhi  VARCHAR(100) PATH '$.jiaozhi',
        zhiwu    VARCHAR(100) PATH '$.zhiwu',
        tel      VARCHAR(50)  PATH '$.tel',
        paixu    VARCHAR(20)  PATH '$.paixu'
      )
    ) jt
  ), JSON_ARRAY()),
  CASE r.state
    WHEN '正在编辑'   THEN 'draft'
    WHEN '待镇级审核' THEN 'pending_town'
    WHEN '待县级审核' THEN 'pending_county'
    WHEN '审核通过'   THEN 'approved'
    WHEN '审核失败'   THEN 'rejected'
    ELSE 'draft'
  END,
  CASE WHEN CAST(r.kaiguan AS UNSIGNED) = 1 THEN 1 ELSE 0 END,
  CASE WHEN r.tijiao_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(r.tijiao_time AS DATETIME) ELSE NULL END,
  NULLIF(r.zhenji, ''),
  CASE WHEN r.zhenji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(r.zhenji_time AS DATETIME) ELSE NULL END,
  NULLIF(r.xianji, ''),
  CASE WHEN r.xianji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(r.xianji_time AS DATETIME) ELSE NULL END,
  NULL,
  NULL
FROM msgk_legacy.renyuan r
JOIN venues v ON v.id = r.cid
-- 同第 3 节：同一场所多条时保留 rid 最小者
WHERE NOT EXISTS (
  SELECT 1 FROM msgk_legacy.renyuan r2 WHERE r2.cid = r.cid AND r2.rid < r.rid
);

-- ============================================================================
-- 第 5 节：安全文章 anquan → safety_articles + safety_article_venues
-- anquan.cids 为 JSON 数组（关联场所），展开写入关联表；旧县级管理员发布
-- 的“全部场所”文章其 cids 来自该账号自身 cids，若为 [] 则迁移后无场所
-- 关联，新系统按关联场所查询，需人工确认是否补关联。
-- anquan.zid 为发布者 aid，经 tmp_admin_map 映射到 created_by/updated_by；
-- 旧 rid 按 1/2/3/999 映射为 county/town/venue/super；其他自定义角色置 NULL。
-- 旧库无独立更新时间列，updated_at 同 created_at 取 anquan.time。
-- ============================================================================
INSERT INTO safety_articles (
  id, title, cover_url, content, author_name, author_role,
  state, published, submitted_at, town_note, town_reviewed_at,
  county_note, county_reviewed_at, created_by, updated_by, created_at, updated_at
)
SELECT
  a.aid,
  a.title,
  NULLIF(a.img, ''),
  COALESCE(a.content, ''),
  NULLIF(a.author, ''),
  CASE a.rid WHEN 1 THEN 'county' WHEN 2 THEN 'town' WHEN 3 THEN 'venue' WHEN 999 THEN 'super' ELSE NULL END,
  CASE a.state
    WHEN '正在编辑'   THEN 'draft'
    WHEN '待镇级审核' THEN 'pending_town'
    WHEN '待县级审核' THEN 'pending_county'
    WHEN '审核通过'   THEN 'approved'
    WHEN '审核失败'   THEN 'rejected'
    ELSE 'draft'
  END,
  CASE WHEN CAST(a.kaiguan AS UNSIGNED) = 1 THEN 1 ELSE 0 END,
  CASE WHEN a.tijiao_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.tijiao_time AS DATETIME) ELSE NULL END,
  NULLIF(a.zhenji, ''),
  CASE WHEN a.zhenji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.zhenji_time AS DATETIME) ELSE NULL END,
  NULLIF(a.xianji, ''),
  CASE WHEN a.xianji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.xianji_time AS DATETIME) ELSE NULL END,
  m.new_id,
  m.new_id,
  CASE WHEN a.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.time AS DATETIME) ELSE NOW() END,
  CASE WHEN a.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(a.time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.anquan a
LEFT JOIN tmp_admin_map m ON m.old_aid = a.zid;

INSERT INTO safety_article_venues (article_id, venue_id)
SELECT DISTINCT a.aid, jt.cid
FROM msgk_legacy.anquan a
JOIN JSON_TABLE(
  CASE WHEN JSON_VALID(a.cids) THEN a.cids ELSE '[]' END,
  '$[*]' COLUMNS (cid BIGINT UNSIGNED PATH '$')
) jt
-- 仅保留仍存在的场所；引用已删除场所的关联自动跳过
JOIN venues v ON v.id = jt.cid;

-- ============================================================================
-- 第 6 节：新闻分类与文章 news_type/news → news_categories/news_articles
-- 旧分类表无排序字段，sort_order 暂用分类 id 代替初始顺序，可在新后台调整。
-- 旧 news.state=1 表示发布（小程序查询条件），映射 published=1。
-- ============================================================================
INSERT INTO news_categories (id, name, sort_order, created_at)
SELECT t.tid, t.name, t.tid, NOW()
FROM msgk_legacy.news_type t;

INSERT INTO news_articles (
  id, category_id, title, summary, cover_url, content, author_name,
  published, created_by, updated_by, created_at
)
SELECT
  n.nid,
  n.tid,
  n.title,
  NULLIF(n.zhaiyao, ''),
  NULLIF(n.img, ''),
  COALESCE(n.content, ''),
  NULLIF(n.author, ''),
  CASE WHEN CAST(n.state AS UNSIGNED) = 1 THEN 1 ELSE 0 END,
  NULL,
  NULL,
  CASE WHEN n.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(n.time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.news n
-- 分类已删除的孤儿文章自动跳过（news_type 删除不清理 news）
JOIN news_categories c ON c.id = n.tid;

-- ============================================================================
-- 第 7 节：公告 gonggao → notices + notice_reads
-- type_name：内部公告→internal，小程序公告及其他取值→public（旧系统仅这两
-- 种分类，见旧后台 notice.vue；如出现第三种取值会归入 public，请先确认）。
-- 已读记录来自 gonggao.aids（JSON 数组）：旧数据没有已读时间，read_at 统一
-- 用公告发布时间代替；已注销账号的已读记录跳过。
-- ============================================================================
INSERT INTO notices (
  id, title, kind, cover_url, content, author_name,
  published, created_by, updated_by, created_at
)
SELECT
  g.gid,
  g.title,
  CASE WHEN g.type_name = '内部公告' THEN 'internal' ELSE 'public' END,
  NULLIF(g.img, ''),
  COALESCE(g.content, ''),
  NULLIF(g.author, ''),
  CASE WHEN CAST(g.state AS UNSIGNED) = 1 THEN 1 ELSE 0 END,
  NULL,
  NULL,
  CASE WHEN g.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(g.time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.gonggao g;

INSERT IGNORE INTO notice_reads (notice_id, admin_id, read_at)
SELECT DISTINCT
  g.gid,
  m.new_id,
  CASE WHEN g.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(g.time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.gonggao g
JOIN JSON_TABLE(
  CASE WHEN JSON_VALID(g.aids) THEN g.aids ELSE '[]' END,
  '$[*]' COLUMNS (aid BIGINT UNSIGNED PATH '$')
) jt
JOIN tmp_admin_map m ON m.old_aid = jt.aid;

-- ============================================================================
-- 第 8 节：账单与明细 zhangdan/mingxi → bills/bill_items
-- zhangdan.time 为 'YYYY-MM'（旧前端 value-format），直接作为 bill_month；
-- mingxi 与账单的关联按 cid + 年月推导（旧代码同款逻辑），找不到账单的
-- 明细自动跳过（见 0.8 自检）。
-- 账单无创建时间，created_at 取账单月首日；明细用 tijiao_time。
-- ============================================================================
INSERT INTO bills (
  id, venue_id, bill_month, income, expense, previous_balance, current_balance,
  state, published, submitted_at, town_note, town_reviewed_at,
  county_note, county_reviewed_at, created_by, updated_by, created_at
)
SELECT
  z.zid,
  z.cid,
  CASE WHEN z.time REGEXP '^[0-9]{4}-[0-9]{2}' THEN LEFT(z.time, 7)
       ELSE '1970-01' END, -- 异常格式兜底并占位，需人工修正（正常数据不会出现）
  CAST(COALESCE(NULLIF(z.shouru, ''), '0') AS DECIMAL(14,2)),
  CAST(COALESCE(NULLIF(z.zhichu, ''), '0') AS DECIMAL(14,2)),
  CASE WHEN TRIM(COALESCE(z.shangyue_jieyu, '')) REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
       THEN CAST(TRIM(z.shangyue_jieyu) AS DECIMAL(14,2)) ELSE 0 END,
  CASE WHEN TRIM(COALESCE(z.benyue_jieyu, '')) REGEXP '^-?[0-9]+(\\.[0-9]+)?$'
       THEN CAST(TRIM(z.benyue_jieyu) AS DECIMAL(14,2)) ELSE 0 END,
  CASE z.state
    WHEN '正在编辑'   THEN 'draft'
    WHEN '待镇级审核' THEN 'pending_town'
    WHEN '待县级审核' THEN 'pending_county'
    WHEN '审核通过'   THEN 'approved'
    WHEN '审核失败'   THEN 'rejected'
    ELSE 'draft'
  END,
  CASE WHEN CAST(z.kaiguan AS UNSIGNED) = 1 THEN 1 ELSE 0 END,
  CASE WHEN z.tijiao_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(z.tijiao_time AS DATETIME) ELSE NULL END,
  NULLIF(z.zhenji, ''),
  CASE WHEN z.zhenji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(z.zhenji_time AS DATETIME) ELSE NULL END,
  NULLIF(z.xianji, ''),
  CASE WHEN z.xianji_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(z.xianji_time AS DATETIME) ELSE NULL END,
  NULL,
  NULL,
  CASE WHEN z.time REGEXP '^[0-9]{4}-[0-9]{2}'
       THEN STR_TO_DATE(CONCAT(LEFT(z.time, 7), '-01'), '%Y-%m-%d')
       ELSE NOW() END
FROM msgk_legacy.zhangdan z
JOIN venues v ON v.id = z.cid;

INSERT INTO bill_items (
  id, bill_id, venue_id, occurred_on, kind, summary, amount,
  created_by, created_at
)
SELECT
  m.mid,
  b.id,
  b.venue_id,
  DATE(m.time),
  CASE m.type WHEN '收入' THEN 'income' WHEN '支出' THEN 'expense' END,
  LEFT(COALESCE(m.name, ''), 100),
  CAST(COALESCE(NULLIF(m.jine, ''), '0') AS DECIMAL(14,2)),
  NULL,
  CASE WHEN m.tijiao_time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(m.tijiao_time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.mingxi m
JOIN msgk_legacy.zhangdan z
  ON z.cid = m.cid
 AND LEFT(z.time, 7) = LEFT(m.time, 7)
JOIN bills b ON b.id = z.zid
-- 类型非 收入/支出、日期无法识别（occurred_on 不允许 NULL）的明细跳过，
-- 请先按 0.7/0.8 自检确认无此类数据，或人工处理后取消本条件
WHERE m.type IN ('收入', '支出')
  AND m.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}';

-- ============================================================================
-- 第 9 节：操作日志 log → operation_logs
-- admin_id 经 tmp_admin_map 映射，账号已不存在的日志 admin_id 置 NULL
-- （列允许 NULL），admin_name 保留旧 log.name 快照。
-- ============================================================================
INSERT INTO operation_logs (admin_id, admin_name, module, target, action, ip, created_at)
SELECT
  m.new_id,
  NULLIF(l.name, ''),
  LEFT(COALESCE(NULLIF(l.page, ''), '未知'), 50),
  NULLIF(LEFT(l.mubiao, 200), ''),
  LEFT(COALESCE(l.neirong, ''), 100),
  NULLIF(l.ip, ''),
  CASE WHEN l.time REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
       THEN CAST(l.time AS DATETIME) ELSE NOW() END
FROM msgk_legacy.log l
LEFT JOIN tmp_admin_map m ON m.old_aid = l.aid;

-- ============================================================================
-- 第 10 节：执行后校验（只读，输出应与旧库行数吻合；差异请对照第 0 节自检）
-- ============================================================================
SELECT 'venues'            AS tbl, (SELECT COUNT(*) FROM venues)            AS new_cnt, (SELECT COUNT(*) FROM msgk_legacy.changsuo)  AS legacy_cnt
UNION ALL
SELECT 'admins',           (SELECT COUNT(*) FROM admins),           (SELECT COUNT(DISTINCT name) FROM msgk_legacy.admin) + (SELECT COUNT(*) FROM admins WHERE phone = '15224499331' AND id NOT IN (SELECT new_id FROM tmp_admin_map))
UNION ALL
SELECT 'venue_profiles',   (SELECT COUNT(*) FROM venue_profiles),   (SELECT COUNT(DISTINCT cid) FROM msgk_legacy.jieshao)
UNION ALL
SELECT 'personnel',        (SELECT COUNT(*) FROM personnel),        (SELECT COUNT(DISTINCT cid) FROM msgk_legacy.renyuan)
UNION ALL
SELECT 'safety_articles',  (SELECT COUNT(*) FROM safety_articles),  (SELECT COUNT(*) FROM msgk_legacy.anquan)
UNION ALL
SELECT 'news_categories',  (SELECT COUNT(*) FROM news_categories),  (SELECT COUNT(*) FROM msgk_legacy.news_type)
UNION ALL
SELECT 'news_articles',    (SELECT COUNT(*) FROM news_articles),    (SELECT COUNT(*) FROM msgk_legacy.news)
UNION ALL
SELECT 'notices',          (SELECT COUNT(*) FROM notices),          (SELECT COUNT(*) FROM msgk_legacy.gonggao)
UNION ALL
SELECT 'bills',            (SELECT COUNT(*) FROM bills),            (SELECT COUNT(*) FROM msgk_legacy.zhangdan)
UNION ALL
SELECT 'bill_items',       (SELECT COUNT(*) FROM bill_items),       (SELECT COUNT(*) FROM msgk_legacy.mingxi)
UNION ALL
SELECT 'operation_logs',   (SELECT COUNT(*) FROM operation_logs),   (SELECT COUNT(*) FROM msgk_legacy.log);

-- 需要人工处理的清单（有输出即需跟进）：
-- 10.1 角色落入占位 role_id=3 的非标准角色账号（rid 非 1/2/3/999）：
SELECT m.new_id, a.phone, a.name, la.rid AS legacy_rid
FROM tmp_admin_map m
JOIN admins a ON a.id = m.new_id
JOIN msgk_legacy.admin la ON la.aid = m.old_aid
WHERE la.rid NOT IN (1, 2, 3, 999);
-- 10.2 旧 aid 被平移的账号（主键与迁移前不一致，旧导出对账时注意）：
SELECT m.old_aid, m.new_id, a.phone, a.name
FROM tmp_admin_map m
JOIN admins a ON a.id = m.new_id
WHERE m.old_aid <> m.new_id;
-- 10.3 无任何场所关联的已公开安全文章（旧“全部场所”数据，需人工确认）：
SELECT s.id, s.title FROM safety_articles s
LEFT JOIN safety_article_venues sv ON sv.article_id = s.id
WHERE sv.article_id IS NULL AND s.published = 1 AND s.state = 'approved';

COMMIT;

-- ============================================================================
-- 【重复执行说明】本脚本按“全新空库”设计，重复执行会因主键/唯一键冲突报错。
-- 如需演练后重来，请先回滚或手工清空下列业务表（按外键顺序），再重新执行：
--   SET FOREIGN_KEY_CHECKS=0;
--   TRUNCATE notice_reads; TRUNCATE notices; TRUNCATE bill_items;
--   TRUNCATE bills; TRUNCATE news_articles; TRUNCATE news_categories;
--   TRUNCATE safety_article_venues; TRUNCATE safety_articles;
--   TRUNCATE personnel; TRUNCATE venue_profiles; TRUNCATE operation_logs;
--   DELETE FROM admins WHERE phone <> '15224499331'; TRUNCATE venues;
--   SET FOREIGN_KEY_CHECKS=1;
-- 注意：以上清表语句会破坏已有数据，仅限演练环境，正式库请勿执行。
-- ============================================================================
