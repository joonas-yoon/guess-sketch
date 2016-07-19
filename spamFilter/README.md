1. 문자열에서 공백을 제거한다.
 
2. 음절단위 변환을 거친다. (ㅈr => 자)

3. 일치하는 단어를 찾는다면 필터를 적용한다.

4. 문자열에서 숫자와 특수문자를를 제거한다.

5. (2, 3)을 다시 확인한다.

---

#### symbols.json

filename : symbols.json
 
filetype : application/json

description :
```(key: array)의 형식
key : 대표음 혹은 완성음
array: key를 나타내는 변형표현들
단, u->v의 일방적인 변환 형태이므로, 양방향 변환에 대해서는 따로 추가해줘야한다.
예를 들면, "댕"<=>"멍"과 같은 경우에 대해서는 서로 추가해야한다.
```

#### keywords.json

filename : keywords.json

filetype : application/json

description :
```금지어가 들어있는 array```