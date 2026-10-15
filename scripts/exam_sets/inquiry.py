"""누리마켓 다국어 고객문의 분류 (보통)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .common import block, bundle, explain, join_codes, memo_block, pdf_file

SET_ID = "nuri-multilingual-inquiry"
ISSUER = "누리마켓"
START, END = "2026-11-01", "2026-11-30"
LANGS = ["KO", "EN", "JA", "ZH"]
LANG_FILE = {"KO": "한국어", "EN": "영어", "JA": "일본어", "ZH": "중국어"}
ORDER = ["SAF", "PAY", "REF", "DLV", "PRD", "ACC"]
CATEGORY_NAMES = {"SAF": "안전·위해", "PAY": "결제 오류", "REF": "환불·반품", "DLV": "배송", "PRD": "상품 문제", "ACC": "계정", "GEN": "기타"}

KEYWORDS = {
    "SAF": {"KO": ["화상", "발화", "연기", "불꽃"], "EN": ["burn", "fire", "smoke", "overheat"], "JA": ["発火", "火傷", "発煙", "焦げ"], "ZH": ["起火", "烫伤", "冒烟", "着火"]},
    "PAY": {"KO": ["이중 결제", "중복 결제", "결제 오류", "결제가 두 번"], "EN": ["charged twice", "double charge", "payment failed", "billing error"], "JA": ["二重請求", "決済エラー", "請求ミス", "二重に引き落とし"], "ZH": ["重复扣款", "支付失败", "扣款错误", "多扣"]},
    "REF": {"KO": ["환불", "반품", "교환"], "EN": ["refund", "return", "exchange"], "JA": ["返金", "返品", "交換"], "ZH": ["退款", "退货", "换货"]},
    "DLV": {"KO": ["배송", "택배", "도착", "송장"], "EN": ["delivery", "shipping", "tracking", "arrive"], "JA": ["配送", "配達", "追跡", "届きません"], "ZH": ["配送", "快递", "物流", "送达"]},
    "PRD": {"KO": ["불량", "고장", "사이즈", "파손"], "EN": ["defective", "broken", "wrong size", "damaged"], "JA": ["不良", "故障", "サイズ", "破損"], "ZH": ["故障", "破损", "尺码", "瑕疵"]},
    "ACC": {"KO": ["로그인", "비밀번호", "탈퇴", "회원"], "EN": ["login", "password", "account", "sign in"], "JA": ["ログイン", "パスワード", "退会", "アカウント"], "ZH": ["登录", "密码", "注销", "账号"]},
}

PRODUCTS = {
    "KO": ["무선 이어폰", "텀블러", "후드티", "전기포트", "에어프라이어"],
    "EN": ["wireless earbuds", "tumbler", "hoodie", "kettle", "air fryer"],
    "JA": ["ワイヤレスイヤホン", "タンブラー", "パーカー", "電気ケトル", "エアフライヤー"],
    "ZH": ["无线耳机", "保温杯", "卫衣", "电热水壶", "空气炸锅"],
}

TEMPLATES = {
    "KO": {
        "SAF": ["{p} 사용 중에 본체가 뜨거워지면서 연기가 났습니다. 바로 전원을 껐어요.", "충전하다가 {p}에서 불꽃이 튀었습니다. 아이가 놀랄 뻔했어요.", "{p}에 손이 닿아 화상을 입었습니다. 병원에 다녀왔어요.", "{p} 전원부가 발화한 것 같아요. 사진 첨부합니다."],
        "PAY": ["카드로 한 번 주문했는데 이중 결제가 되었습니다. 확인 부탁드립니다.", "결제 오류가 떠서 다시 눌렀더니 금액이 두 번 빠져나갔어요.", "{p} 결제가 두 번 승인됐어요. 한 건만 바로잡아 주세요.", "무통장 입금했는데 중복 결제로 처리됐다고 나와요."],
        "REF": ["{p} 단순 변심으로 환불 받고 싶습니다. 방법 알려주세요.", "받은 {p} 반품하려고 하는데 어디로 보내면 되나요?", "{p} 색상이 달라서 교환 가능한가요?", "구매한 지 3일 됐는데 환불 규정이 궁금합니다."],
        "DLV": ["{p} 주문 후 일주일째 배송이 시작되지 않았어요.", "택배가 집 앞에 없는데 도착했다고 나옵니다.", "송장번호로 조회해도 위치가 안 나와요. {p} 언제 오나요?", "{p} 배송지를 회사로 바꾸고 싶은데 아직 가능한가요?"],
        "PRD": ["{p} 받자마자 고장 나 있었습니다. 전원이 안 켜져요.", "{p} 사이즈가 표기와 너무 달라요. 한 치수 크게 왔습니다.", "포장이 뜯겨 있고 {p} 파손되어 있었어요.", "{p} 옆면에 불량이 있습니다. 사진 보내드릴게요."],
        "ACC": ["앱에 로그인이 안 됩니다. 비밀번호를 바꿔도 같아요.", "회원 탈퇴는 어디서 하나요?", "비밀번호 재설정 메일이 오지 않아요.", "가입한 이메일을 바꾸고 싶은데 회원 정보 수정 메뉴가 안 보여요."],
        "GEN": ["{p} 재입고 일정이 궁금합니다.", "{p} 선물용으로 구매하려는데 포장 옵션이 있나요?", "사업자 대량 구매 견적을 받을 수 있을까요?", "{p} 사용 설명서를 PDF로 받을 수 있나요?", "이벤트 당첨자 발표는 언제인가요?"],
    },
    "EN": {
        "SAF": ["My {p} started to smoke while charging. I unplugged it right away.", "I got a burn on my hand from the {p}. I went to a clinic.", "The {p} plug looks like it could catch fire. Photos attached.", "The {p} began to overheat after ten minutes of use."],
        "PAY": ["I was charged twice for the same order. Please check.", "The page said payment failed but the money left my card.", "There is a billing error on my {p} order. The amount is wrong.", "I see a double charge for the {p} purchase."],
        "REF": ["I would like a refund for the {p}. It was not what I expected.", "How can I return the {p} I received?", "Can I get an exchange for the {p} in another color?", "What is your refund policy? I bought the {p} three days ago."],
        "DLV": ["It has been a week and the {p} delivery has not started.", "The tracking page shows nothing for my {p} parcel.", "When will the {p} arrive? The date keeps changing.", "Can I change the shipping address for my {p} order?"],
        "PRD": ["The {p} is defective. It will not turn on.", "My {p} came in the wrong size compared with the label.", "The box was crushed and the {p} was damaged.", "The {p} was broken when I opened the box."],
        "ACC": ["I cannot login to the app. The error stays the same.", "I forgot my password and the reset email never shows up.", "How do I close my account?", "I want to change the email on my account but I cannot find the menu."],
        "GEN": ["When will the {p} be back in stock?", "Does the {p} come with a gift wrap option?", "Can my company get a quote for a bulk purchase?", "Where can I find the user manual for the {p}?", "When are the event winners announced?"],
    },
    "JA": {
        "SAF": ["{p}を充電していたら発煙しました。すぐにコンセントを抜きました。", "{p}が熱くなって火傷をしました。", "{p}から焦げた臭いがして怖かったです。", "{p}の電源部分が発火したようです。写真を添付します。"],
        "PAY": ["同じ注文で二重請求になっています。確認をお願いします。", "決済エラーが出たのに代金が引き落とされました。", "{p}の請求ミスがあるようです。金額が違います。", "{p}の代金が二重に引き落としされています。"],
        "REF": ["{p}がイメージと違ったので返品したいです。", "購入した{p}の返金手続きを教えてください。", "{p}の色違いに交換できますか。"],
        "DLV": ["注文から一週間経っても配送が始まりません。", "荷物が届きません。{p}はいつ来ますか。", "追跡番号で調べても情報が出ません。", "{p}の配達日の変更はできますか。"],
        "PRD": ["{p}が初期不良のようで動きません。", "{p}のサイズが表示と違います。", "箱が潰れていて{p}が破損していました。", "{p}が故障していて電源が入りません。"],
        "ACC": ["アプリにログインできません。", "パスワードを忘れました。再設定メールが来ません。", "退会の方法を教えてください。", "アカウント情報を変更したいです。"],
        "GEN": ["{p}の再入荷予定を教えてください。", "{p}はギフト包装に対応していますか。", "法人向けの大量購入の見積もりは可能ですか。", "キャンペーンの当選発表はいつですか。"],
    },
    "ZH": {
        "SAF": ["{p}充电时突然冒烟，我马上拔掉了电源。", "用{p}的时候烫伤了手，去医院处理了。", "{p}的插头附近好像要起火了。", "{p}用了十分钟就开始发烫，还有焦味，怕会着火。"],
        "PAY": ["同一个订单出现了重复扣款，请核实。", "页面提示支付失败，但是钱已经被扣了。", "{p}的订单有扣款错误，金额不对。", "{p}的订单被多扣了一笔，请处理。"],
        "REF": ["{p}和描述不符，我想申请退款。", "收到的{p}不想要了，怎么退货？", "{p}可以换货吗？颜色不太喜欢。"],
        "DLV": ["下单一周了还没有配送信息。", "快递显示已签收，但我没收到{p}。", "物流一直没有更新，{p}什么时候到？", "{p}预计什么时候送达？"],
        "PRD": ["{p}收到就有故障，开不了机。", "{p}的尺码比标注的大了一号。", "外包装压坏了，{p}有破损。", "{p}表面有瑕疵，附上照片。"],
        "ACC": ["我无法登录App，一直提示错误。", "忘记密码了，收不到重置邮件。", "请问怎么注销账号？"],
        "GEN": ["{p}什么时候补货？", "{p}可以提供礼品包装吗？", "公司想大批量采购，可以报价吗？", "活动中奖名单什么时候公布？"],
    },
}

NAME_POOLS = {
    "KO": ["김서윤", "이도현", "박지안", "최하린", "정우진", "강민서", "조예린", "윤시우", "장아윤", "임준서", "한유진", "오세아"],
    "EN": ["Emma Clark", "Liam Walker", "Olivia Reed", "Noah Bennett", "Ava Foster", "Mason Hayes", "Sophia Brooks", "Lucas Powell", "Mia Sanders", "Ethan Price", "Chloe Ward", "Jack Morgan"],
    "JA": ["佐藤 美咲", "鈴木 蓮", "高橋 結衣", "田中 大和", "伊藤 陽菜", "渡辺 湊", "山本 凛", "中村 蒼", "小林 莉子", "加藤 悠真", "吉田 彩花", "山田 陽翔"],
    "ZH": ["王磊", "李娜", "张伟", "刘洋", "陈静", "杨帆", "赵敏", "黄涛", "周婷", "吴强", "徐丹", "孙鹏"],
}
TWIN_COUNT = 2


@dataclass
class Customer:
    cid: str
    name: str
    lang: str
    grade: str = "일반"
    effective: str = "2026-01-01"


@dataclass
class Inquiry:
    qid: str
    cid: str
    name: str
    lang: str
    body: str
    stamp: str


@dataclass
class LangFile:
    lang: str
    rows: list[Inquiry] = field(default_factory=list)
    printed: int = 0


def classify(lang: str, body: str) -> str:
    text = body.lower()
    for code in ORDER:
        if any(word.lower() in text for word in KEYWORDS[code][lang]):
            return code
    return "GEN"


def grade_on(customer: Customer, date: str) -> str:
    if customer.effective <= START:
        return customer.grade
    if customer.effective > END:
        return "일반"
    if date < customer.effective:
        return "일반"
    return customer.grade


def check_templates() -> None:
    for lang, groups in TEMPLATES.items():
        for code, items in groups.items():
            for template in items:
                for product in PRODUCTS[lang]:
                    got = classify(lang, template.format(p=product))
                    if got != code:
                        raise SystemExit(f"템플릿 분류 불일치 {lang} {code} -> {got}: {template.format(p=product)}")


def make_customers(rng: random.Random) -> list[Customer]:
    customers: list[Customer] = []
    serial = 310000
    for lang in LANGS:
        names = list(NAME_POOLS[lang])
        for index in range(TWIN_COUNT):
            names[len(names) - 1 - index] = names[index]
        for name in names:
            serial += rng.randrange(3, 40)
            customers.append(Customer(f"C{serial}", name, lang))
    vip_plan = [
        (0, "2026-01-01"), (1, "2026-11-12"), (2, "2026-11-20"), (5, "2026-12-01"),
        (12, "2026-01-01"), (13, "2026-11-08"), (14, "2026-11-25"), (16, "2026-12-15"),
        (24, "2026-01-01"), (25, "2026-11-15"), (26, "2026-11-03"),
        (36, "2026-01-01"), (37, "2026-11-18"), (38, "2026-11-30"),
    ]
    for index, effective in vip_plan:
        customers[index].grade, customers[index].effective = "VIP", effective
    return customers


def build_files(rng: random.Random, customers: list[Customer]) -> list[LangFile]:
    files: list[LangFile] = []
    weights = {"SAF": 3, "PAY": 6, "REF": 9, "DLV": 9, "PRD": 6, "ACC": 4, "GEN": 6}
    pool = [code for code, count in weights.items() for _ in range(count)]
    for lang in LANGS:
        mine = [item for item in customers if item.lang == lang]
        out = LangFile(lang)
        serial = [0]

        def stamp(day: int | None = None, month: int = 11) -> str:
            return f"2026-{month:02d}-{day or rng.randrange(1, 31):02d} {rng.randrange(8, 22):02d}:{rng.randrange(0, 60):02d}"

        def add(body: str, customer: Customer, when: str) -> Inquiry:
            serial[0] += 1
            row = Inquiry(f"Q-{lang}-{serial[0]:03d}", customer.cid, customer.name, lang, body, when)
            out.rows.append(row)
            return row

        def text(code: str) -> str:
            return rng.choice(TEMPLATES[lang][code]).format(p=rng.choice(PRODUCTS[lang]))

        for _ in range(34):
            add(text(rng.choice(pool)), rng.choice(mine), stamp())
        for first, second in rng.sample([("DLV", "REF"), ("PRD", "REF"), ("ACC", "PAY"), ("DLV", "PAY"), ("PRD", "SAF"), ("ACC", "DLV")], 3):
            add(f"{text(first)} {text(second)}", rng.choice(mine), stamp())
        for customer in mine:
            if customer.grade == "VIP" and "2026-11-01" < customer.effective <= END:
                day = int(customer.effective[8:10])
                for code in ("PAY", "REF"):
                    add(text(code), customer, stamp(day))
                if day > 1:
                    add(text(rng.choice(["PAY", "REF"])), customer, stamp(day - 1))
            elif customer.grade == "VIP":
                add(text(rng.choice(["PAY", "REF", "DLV"])), customer, stamp())
        for _ in range(2):
            fake = Customer(f"TEST-{rng.randrange(100, 999)}", {"KO": "시험계정", "EN": "Test User", "JA": "テスト", "ZH": "测试"}[lang], lang)
            add(text(rng.choice(["SAF", "PAY", "REF"])), fake, stamp())
        add(text("SAF"), rng.choice(mine), stamp(31, 10))
        add(text("PAY"), rng.choice(mine), stamp(1, 12))
        add(text("DLV"), rng.choice(mine), stamp(2, 12))

        inside = [row for row in out.rows if START <= row.stamp[:10] <= END and not row.cid.startswith("TEST-")]
        rng.shuffle(inside)
        for row in inside[:3]:
            old_code = classify(lang, row.body)
            other = rng.choice([code for code in ("SAF", "PAY", "REF", "DLV", "GEN") if code != old_code])
            older = Inquiry(row.qid, row.cid, row.name, lang, text(other), f"{row.stamp[:11]}07:15")
            row.stamp = f"{row.stamp[:11]}16:40"
            out.rows.append(older)
        rng.shuffle(out.rows)
        out.rows.sort(key=lambda item: item.stamp[:10])
        out.printed = len(out.rows) + 6
        files.append(out)
    return files


def evaluate(customers: list[Customer], files: list[LangFile]) -> list[dict]:
    by_cid = {item.cid: item for item in customers}
    result: list[dict] = []
    for file in files:
        latest: dict[str, Inquiry] = {}
        for row in file.rows:
            current = latest.get(row.qid)
            if current is None or row.stamp > current.stamp:
                latest[row.qid] = row
        for row in latest.values():
            date = row.stamp[:10]
            if not (START <= date <= END) or row.cid.startswith("TEST-"):
                continue
            code = classify(file.lang, row.body)
            customer = by_cid[row.cid]
            esc = code == "SAF" or (code in {"PAY", "REF"} and grade_on(customer, date) == "VIP")
            result.append({"qid": row.qid, "cid": row.cid, "lang": file.lang, "code": code, "esc": esc})
    return result


def answers_of(rows: list[dict]) -> dict[str, str]:
    q1 = join_codes(row["qid"] for row in rows if row["lang"] in {"KO", "JA"} and row["code"] == "SAF")
    q2 = str(sum(1 for row in rows if row["code"] == "DLV"))
    q3 = str(sum(1 for row in rows if row["esc"]))
    q4 = join_codes(row["cid"] for row in rows if row["lang"] == "EN" and row["code"] == "PAY")
    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4}


def build() -> dict:
    check_templates()
    rng = random.Random(1117)
    customers = make_customers(rng)
    files = build_files(rng, customers)
    rows = evaluate(customers, files)
    answers = answers_of(rows)
    if len(answers["q1"].split(",")) < 3 or len(answers["q4"].split(",")) < 3:
        raise SystemExit(f"문의 정답 조정 필요 {answers}")

    keyword_rows = [
        f"{code}|{index}|{CATEGORY_NAMES[code]}|" + "|".join(";".join(KEYWORDS[code][lang]) for lang in LANGS)
        for index, code in enumerate(ORDER, start=1)
    ]
    policy = "\n".join(
        [
            "누리마켓 다국어 고객문의 분류 가이드.",
            f"기간 {START} {END}",
            "제1조 기간. 접수시각의 날짜가 2026-11-01보다 전이거나 2026-11-30보다 뒤인 문의는 버린다.",
            "제2조 중복. 같은 문의ID가 여러 번 접수되면 접수시각이 가장 늦은 행만 남긴다. 본문이 달라도 늦은 행의 본문을 쓴다. 파일에서 몇 번째 줄인지는 상관없다.",
            "제3조 분류. 문의의 언어는 파일의 언어 열을 따른다. 분류 키워드 표에서 그 언어 열의 키워드가 본문에 들어 있으면 그 분류에 해당한다. 영어는 대소문자를 구분하지 않는다. 여러 분류에 해당하면 우선순위 숫자가 가장 작은 분류 하나만 쓴다. 어느 분류에도 해당하지 않으면 GEN이다.",
            "제4조 에스컬레이션. 분류가 SAF인 문의는 모두 에스컬레이션 대상이다. 분류가 PAY 또는 REF이고 접수일의 고객 등급이 VIP이면 에스컬레이션 대상이다. 그 밖의 분류는 등급과 상관없이 대상이 아니다.",
            "제5조 등급. 고객 마스터의 등급이 접수일의 등급이다. 발효일이 2026-11-01 이전이거나 같으면 11월 전체가 그 등급이다. 발효일이 2026-11-30보다 뒤면 11월 전체는 일반이다. 발효일이 11월 안이면 발효일 전날까지는 일반이고 발효일 당일부터 적힌 등급이다. 예외가 명시되지 않은 한 발효일 이전은 일반으로 본다.",
            "제6조 시험 문의. 고객ID가 TEST- 로 시작하는 문의는 건수 집계와 목록 작성 등 모든 문항에서 버린다.",
            "제7조 소계. 파일 머리의 표기건수와 표 아래 소계 건수는 사용하지 않는다. 이름이 같아도 고객ID가 다르면 다른 고객이다.",
            "",
            block("KEYWORDS", "분류|우선순위|분류명|KO|EN|JA|ZH", keyword_rows),
        ]
    )
    customer_rows = [f"{c.cid}|{c.name}|{c.lang}|{c.grade}|{c.effective}" for c in sorted(customers, key=lambda item: (item.name, item.cid))]
    master = "누리마켓 고객 마스터. 이름 순이며 언어로 묶여 있지 않다.\n\n" + block("CUSTOMERS", "고객ID|이름|언어|등급|발효일", customer_rows)
    files_out = [
        pdf_file(SET_ID, "guide", "01_분류_가이드.pdf", "문의 분류 가이드", policy, ISSUER, "문의 분류", "01_guide.pdf"),
        pdf_file(SET_ID, "customers", "02_고객_마스터.pdf", "고객 마스터", master, ISSUER, "고객 마스터", "02_customers.pdf"),
    ]
    for file in files:
        rows_text = [f"{r.qid}|{r.cid}|{r.name}|{r.lang}|{r.body}|{r.stamp}" for r in file.rows]
        body = "\n".join(
            [
                f"누리마켓 {LANG_FILE[file.lang]} 문의 접수. 언어 {file.lang}.",
                f"표기건수 {file.printed}",
                block("INQUIRIES", "문의ID|고객ID|이름|언어|본문|접수시각", rows_text),
                memo_block(
                    [
                        "이 문단은 현장 메모이며 표의 행이 아니다. 표기건수와 소계는 다시 더하지 않는다.",
                        f"{LANG_FILE[file.lang]} 접수 메모. 본문은 고객이 보낸 문장 그대로이며 번역하지 않았다.",
                        "메모에 적힌 숫자는 예시이며 분류에 쓰지 않는다. 예: 지난 달 배송 문의 120건.",
                    ]
                ),
            ]
        )
        files_out.append(
            pdf_file(SET_ID, f"inq-{file.lang.lower()}", f"03_언어별_접수/{file.lang}_{LANG_FILE[file.lang]}.pdf", f"{LANG_FILE[file.lang]} 문의 접수", body, ISSUER, "문의 접수", f"inquiries/{file.lang}.pdf")
        )

    mistakes = [
        "파일을 한꺼번에 붙여 글자 한도에 걸린다.",
        "한 문의에 키워드가 둘 이상 있을 때 먼저 보이는 분류를 고른다. 우선순위 숫자가 작은 분류 하나만 쓴다.",
        "같은 문의ID를 다시 접수한 행을 모두 세거나 앞 행의 본문으로 분류한다. 접수시각이 늦은 행만 쓴다.",
        "11월 밖 접수일과 TEST- 고객 문의를 센다.",
        "VIP 발효일 당일 접수를 일반으로 본다. 이름이 같은 다른 고객을 합친다.",
    ]
    strategy = "가이드에서 기간, 중복, 분류 우선순위, 에스컬레이션, 등급 발효일, 시험 문의 규칙을 먼저 적는다. 문의 파일은 언어별로 나눠 같은 기준으로 분류한 뒤 합친다."
    questions = [
        {
            "prompt": "11월 접수분 중 KO 파일과 JA 파일에서 분류가 SAF인 문의ID를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
            "answer": answers["q1"],
            "explanation": explain(strategy, mistakes, "01 분류 가이드, KO, JA (고객 마스터는 필요 없다. 두 파일만 붙이면 한도 안에서 풀린다)", "중복은 늦게 접수한 행의 본문으로 분류한다. SAF는 우선순위가 가장 높아 다른 키워드가 함께 있어도 SAF다."),
        },
        {
            "prompt": "11월 접수분 중 분류가 DLV인 문의는 네 언어를 합쳐 몇 건인가. 숫자만 쓰세요.",
            "answer": answers["q2"],
            "explanation": explain(strategy, mistakes, "01 분류 가이드, KO, EN, JA, ZH (고객 마스터는 필요 없다)", "배송 키워드와 함께 더 높은 우선순위 키워드가 있는 문의는 DLV가 아니다."),
        },
        {
            "prompt": "11월 접수분 중 에스컬레이션 대상 문의는 모두 몇 건인가. 숫자만 쓰세요.",
            "answer": answers["q3"],
            "explanation": explain(strategy, mistakes, "01 분류 가이드, 02 고객 마스터, KO, EN, JA, ZH 전부", "SAF는 등급과 상관없이 대상이고 PAY와 REF는 접수일의 등급이 VIP일 때만 대상이다."),
        },
        {
            "prompt": "11월 접수분 중 EN 파일에서 분류가 PAY인 문의를 보낸 고객ID를 오름차순으로 쓰세요. 같은 고객ID는 한 번만 쓰고 쉼표로 구분하며 공백은 넣지 않습니다.",
            "answer": answers["q4"],
            "explanation": explain(strategy, mistakes, "01 분류 가이드, EN (고객 마스터는 필요 없다)", "영어 키워드는 대소문자를 구분하지 않는다. 이름이 같아도 고객ID가 다르면 따로 쓴다."),
        },
    ]
    passage = (
        "누리마켓의 2026년 11월 다국어(한국어, 영어, 일본어, 중국어) 고객문의를 분류 가이드에 따라 분류한다. 분류 가이드, 고객 마스터, 언어별 접수 4개 파일이 나뉘어 있다. "
        "문제마다 필요한 파일이 다르며, 전부 한 번에 붙이면 글자 한도를 넘는다. 표기건수와 소계는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "누리마켓 다국어 고객문의 분류", "문의 분류", "보통", passage, files_out, questions)
    payload["_ref"] = {"answers": answers}
    return payload
