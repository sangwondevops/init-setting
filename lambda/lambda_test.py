import requests
import logging

# 로깅 설정
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    # ECS 클러스터의 서비스 URL
    ecs_service_url = 'backend.hinagiku-dev'

    try:
        # Lambda 함수에서 ECS 클러스터로 API 호출
        logger.info('Sending GET request to ECS service...')
        response = requests.get(ecs_service_url)
        logger.info('Received response: %s', response.text)

        # 응답 반환
        return {
            'statusCode': 200,
            'body': response.text
        }
    except requests.exceptions.RequestException as e:
        # 오류 발생 시 로그 남기기
        logger.error('Request failed: %s', e)
        return {
            'statusCode': 500,
            'body': 'Internal Server Error'
        }
