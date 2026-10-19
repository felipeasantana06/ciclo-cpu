; Soma 1 + 2 + 3 + 4 + 5 = 15 em M30
MOV #0 M30
MOV #1 M31
repetir:
ADD M30 M31 M30
INC M31
CMP M31 #6
JL repetir
HLT

M30: 0
M31: 1
